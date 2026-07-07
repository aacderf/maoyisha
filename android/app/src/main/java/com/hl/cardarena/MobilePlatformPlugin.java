package com.hl.cardarena;

import android.Manifest;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MobilePlatform",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class MobilePlatformPlugin extends Plugin {
    @PluginMethod
    public void ensureMicrophonePermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolvePermission(call, true);
            return;
        }
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        resolvePermission(call, getPermissionState("microphone") == PermissionState.GRANTED);
    }

    private void resolvePermission(PluginCall call, boolean granted) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void enterImmersiveMode(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowCompat.setDecorFitsSystemWindows(window, false);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());
            call.resolve();
        });
    }

    @PluginMethod
    public void refreshSafeArea(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            View webView = getBridge().getWebView();
            ViewCompat.requestApplyInsets(webView);
            WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(webView);
            Insets insets = windowInsets == null
                ? Insets.NONE
                : windowInsets.getInsets(
                    WindowInsetsCompat.Type.displayCutout()
                        | WindowInsetsCompat.Type.systemBars()
                );
            float density = getContext().getResources().getDisplayMetrics().density;
            JSObject result = new JSObject();
            result.put("top", Math.round(insets.top / density));
            result.put("right", Math.round(insets.right / density));
            result.put("bottom", Math.round(insets.bottom / density));
            result.put("left", Math.round(insets.left / density));
            call.resolve(result);
        });
    }
}
