package com.hl.cardarena;

import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Android 资源热更新边界。这里只更新 assets/config、assets/logic 和媒体资源，
 * 不接触 CloudBase、Photon 或游戏规则状态。
 */
@CapacitorPlugin(name = "HotUpdate")
public class HotUpdatePlugin extends Plugin {
    private static final int RETRY_COUNT = 3;
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void checkUpdate(PluginCall call) {
        String baseUrl = trimBaseUrl(call.getString("baseUrl", ""));
        if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
            call.reject("远端热更新地址无效。");
            return;
        }
        executor.execute(() -> {
            try {
                notifyProgress("checking", 3, "检查七牛资源清单");
                String manifestText = requestText(baseUrl + "/version.json");
                String signatureText = requestText(baseUrl + "/version.sig").trim();
                verifySignature(manifestText, signatureText);

                JSONObject remoteManifest = new JSONObject(manifestText);
                JSONObject localManifest = readLocalManifest();
                JSONArray changed = selectChangedFiles(remoteManifest, localManifest);
                if (changed.length() == 0) {
                    writeActiveManifest(manifestText, signatureText);
                    JSObject result = activeResult("none", "当前已是最新资源。");
                    notifyProgress("none", 100, "无更新");
                    call.resolve(result);
                    return;
                }

                long totalBytes = totalSize(changed);
                long completedBytes = 0L;
                File tempRoot = new File(getContext().getFilesDir(), "hot-update-temp");
                deleteRecursively(tempRoot);
                if (!tempRoot.mkdirs() && !tempRoot.isDirectory()) {
                    throw new IllegalStateException("无法创建热更新临时目录。");
                }

                for (int index = 0; index < changed.length(); index++) {
                    JSONObject file = changed.getJSONObject(index);
                    String path = safePath(file.getString("path"));
                    long size = file.optLong("size", 0L);
                    File tempFile = new File(tempRoot, path);
                    downloadWithRetry(baseUrl + "/" + path, tempFile, file.getString("md5"), completedBytes, totalBytes);
                    completedBytes += size;
                }

                notifyProgress("verifying", 96, "校验完成，正在启用新资源");
                File activeRoot = activeRoot();
                for (int index = 0; index < changed.length(); index++) {
                    String path = safePath(changed.getJSONObject(index).getString("path"));
                    File source = new File(tempRoot, path);
                    File target = new File(activeRoot, path);
                    File parent = target.getParentFile();
                    if (parent != null && !parent.mkdirs() && !parent.isDirectory()) {
                        throw new IllegalStateException("无法创建资源目录：" + path);
                    }
                    Files.move(source.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
                pruneRemovedFiles(activeRoot, remoteManifest);
                writeActiveManifest(manifestText, signatureText);
                deleteRecursively(tempRoot);

                notifyProgress("complete", 100, "更新完成");
                call.resolve(activeResult("complete", "资源更新完成。"));
            } catch (Exception error) {
                notifyProgress("fallback", 100, "更新失败，使用本地资源");
                call.resolve(activeResult("fallback", readableError(error)));
            }
        });
    }

    @PluginMethod
    public void getActiveManifest(PluginCall call) {
        executor.execute(() -> call.resolve(activeResult("fallback", "使用本地已有资源。")));
    }

    private JSObject activeResult(String status, String detail) {
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("detail", detail);
        result.put("assetRootUri", Uri.fromFile(activeRoot()).toString());
        JSArray files = new JSArray();
        collectRelativeFiles(activeRoot(), activeRoot(), files);
        result.put("files", files);
        try {
            result.put("manifest", readLocalManifest());
        } catch (Exception ignored) {
            result.put("manifest", new JSObject());
        }
        return result;
    }

    private void notifyProgress(String status, int progress, String detail) {
        JSObject event = new JSObject();
        event.put("status", status);
        event.put("progress", progress);
        event.put("detail", detail);
        notifyListeners("hotUpdateProgress", event);
    }

    private JSONObject readLocalManifest() throws Exception {
        File local = new File(activeRoot(), "version.json");
        if (local.isFile()) return new JSONObject(readFile(local));
        try (InputStream input = getContext().getAssets().open("public/version.json")) {
            return new JSONObject(readStream(input));
        }
    }

    private void writeActiveManifest(String manifest, String signature) throws Exception {
        File root = activeRoot();
        if (!root.mkdirs() && !root.isDirectory()) throw new IllegalStateException("无法创建资源目录。");
        writeFile(new File(root, "version.json"), manifest);
        writeFile(new File(root, "version.sig"), signature + "\n");
    }

    private JSONArray selectChangedFiles(JSONObject remote, JSONObject local) throws Exception {
        JSONArray result = new JSONArray();
        JSONObject localByPath = new JSONObject();
        JSONArray localFiles = local.optJSONArray("files");
        if (localFiles != null) {
            for (int i = 0; i < localFiles.length(); i++) {
                JSONObject file = localFiles.getJSONObject(i);
                localByPath.put(file.optString("path"), file);
            }
        }
        JSONArray remoteFiles = remote.optJSONArray("files");
        if (remoteFiles == null) return result;
        for (int i = 0; i < remoteFiles.length(); i++) {
            JSONObject file = remoteFiles.getJSONObject(i);
            String path = safePath(file.getString("path"));
            JSONObject previous = localByPath.optJSONObject(path);
            File activeFile = new File(activeRoot(), path);
            boolean sameManifest = previous != null
                && file.optString("md5").equalsIgnoreCase(previous.optString("md5"))
                && file.optLong("size") == previous.optLong("size");
            boolean hasUsableFile = activeFile.isFile() || bundledAssetExists(path);
            if (!sameManifest || !hasUsableFile) result.put(file);
        }
        return result;
    }

    private boolean bundledAssetExists(String path) {
        try (InputStream ignored = getContext().getAssets().open("public/" + path)) {
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void downloadWithRetry(
        String url,
        File destination,
        String expectedMd5,
        long completedBytes,
        long totalBytes
    ) throws Exception {
        Exception lastError = null;
        for (int attempt = 1; attempt <= RETRY_COUNT; attempt++) {
            try {
                downloadFile(url, destination, completedBytes, totalBytes);
                String actualMd5 = md5(destination);
                if (!actualMd5.equalsIgnoreCase(expectedMd5)) {
                    throw new IllegalStateException("MD5 校验失败：" + destination.getName());
                }
                return;
            } catch (Exception error) {
                lastError = error;
                if (attempt < RETRY_COUNT) {
                    notifyProgress("downloading", 5, "下载失败，正在重试 " + attempt + "/" + RETRY_COUNT);
                }
            }
        }
        throw lastError == null ? new IllegalStateException("下载失败。") : lastError;
    }

    private void downloadFile(String sourceUrl, File destination, long completedBytes, long totalBytes) throws Exception {
        File parent = destination.getParentFile();
        if (parent != null && !parent.mkdirs() && !parent.isDirectory()) {
            throw new IllegalStateException("无法创建下载目录。");
        }
        long existing = destination.isFile() ? destination.length() : 0L;
        HttpURLConnection connection = open(sourceUrl);
        if (existing > 0) connection.setRequestProperty("Range", "bytes=" + existing + "-");
        int status = connection.getResponseCode();
        boolean append = existing > 0 && status == HttpURLConnection.HTTP_PARTIAL;
        if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status + "：" + sourceUrl);
        if (!append) existing = 0L;

        try (
            InputStream input = new BufferedInputStream(connection.getInputStream());
            FileOutputStream output = new FileOutputStream(destination, append)
        ) {
            byte[] buffer = new byte[64 * 1024];
            long current = existing;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                output.write(buffer, 0, read);
                current += read;
                long downloaded = completedBytes + current;
                int percent = totalBytes > 0 ? (int) Math.min(95, Math.round(downloaded * 95.0 / totalBytes)) : 95;
                notifyProgress("downloading", Math.max(5, percent), formatBytes(downloaded) + " / " + formatBytes(totalBytes));
            }
        } finally {
            connection.disconnect();
        }
    }

    private String requestText(String sourceUrl) throws Exception {
        HttpURLConnection connection = open(sourceUrl);
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status + "：" + sourceUrl);
        try (InputStream input = connection.getInputStream()) {
            return readStream(input);
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection open(String sourceUrl) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(sourceUrl).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Cache-Control", "no-cache");
        return connection;
    }

    private void verifySignature(String manifest, String signatureText) throws Exception {
        String pem;
        try (InputStream input = getContext().getResources().openRawResource(R.raw.hot_update_public_key)) {
            pem = readStream(input);
        }
        String body = pem
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replaceAll("\\s+", "");
        PublicKey key = KeyFactory.getInstance("RSA").generatePublic(
            new X509EncodedKeySpec(Base64.decode(body, Base64.DEFAULT))
        );
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(key);
        verifier.update(manifest.getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.decode(signatureText, Base64.DEFAULT))) {
            throw new SecurityException("version.sig 签名校验失败。");
        }
    }

    private void pruneRemovedFiles(File root, JSONObject manifest) throws Exception {
        Set<String> allowed = new HashSet<>();
        allowed.add("version.json");
        allowed.add("version.sig");
        JSONArray files = manifest.optJSONArray("files");
        if (files != null) {
            for (int i = 0; i < files.length(); i++) {
                allowed.add(safePath(files.getJSONObject(i).getString("path")));
            }
        }
        prune(root, root, allowed);
    }

    private void prune(File root, File current, Set<String> allowed) throws Exception {
        File[] children = current.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) {
                prune(root, child, allowed);
                File[] remaining = child.listFiles();
                if (remaining != null && remaining.length == 0) child.delete();
            } else {
                String path = root.toPath().relativize(child.toPath()).toString().replace('\\', '/');
                if (!allowed.contains(path)) Files.deleteIfExists(child.toPath());
            }
        }
    }

    private void collectRelativeFiles(File root, File current, JSArray output) {
        File[] children = current.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) collectRelativeFiles(root, child, output);
            else output.put(root.toPath().relativize(child.toPath()).toString().replace('\\', '/'));
        }
    }

    private File activeRoot() {
        return new File(getContext().getFilesDir(), "hot-assets");
    }

    private String safePath(String value) {
        String path = value.replace('\\', '/').replaceAll("^/+", "");
        if (!path.startsWith("assets/") || path.contains("../")) {
            throw new IllegalArgumentException("非法热更新路径：" + value);
        }
        return path;
    }

    private long totalSize(JSONArray files) {
        long total = 0L;
        for (int i = 0; i < files.length(); i++) total += files.optJSONObject(i).optLong("size", 0L);
        return total;
    }

    private String md5(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("MD5");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) digest.update(buffer, 0, read);
        }
        StringBuilder hex = new StringBuilder();
        for (byte item : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", item));
        return hex.toString();
    }

    private String readFile(File file) throws Exception {
        try (InputStream input = new FileInputStream(file)) {
            return readStream(input);
        }
    }

    private String readStream(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[16 * 1024];
        int read;
        while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private void writeFile(File file, String content) throws Exception {
        File parent = file.getParentFile();
        if (parent != null && !parent.mkdirs() && !parent.isDirectory()) {
            throw new IllegalStateException("无法创建目录。");
        }
        try (FileOutputStream output = new FileOutputStream(file, false)) {
            output.write(content.getBytes(StandardCharsets.UTF_8));
        }
    }

    private void deleteRecursively(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }

    private String trimBaseUrl(String value) {
        return value == null ? "" : value.trim().replaceAll("/+$", "");
    }

    private String readableError(Exception error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? "更新失败，已使用本地资源。" : message;
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0);
        return String.format(Locale.ROOT, "%.1f MB", bytes / 1024.0 / 1024.0);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
