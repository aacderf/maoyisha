using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;

namespace MaoyishaUpdater;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        try
        {
            if (args.Length > 0) return RunCli(args);

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new UpdaterForm());
            return 0;
        }
        catch (Exception error)
        {
            TryWriteCrashLog(error);
            if (args.Length > 0)
            {
                Console.Error.WriteLine(error);
                return 1;
            }
            MessageBox.Show(error.Message, "茂一杀更新器", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static int RunCli(string[] args)
    {
        var command = args[0].Trim().ToLowerInvariant();
        var target = args.Length > 1 ? args[1] : "";
        if (string.IsNullOrWhiteSpace(target))
        {
            Console.Error.WriteLine("用法：茂一杀更新器.exe --check <游戏目录> 或 --apply <游戏目录>");
            return 2;
        }

        var engine = new UpdateEngine(AppContext.BaseDirectory);
        if (command == "--check")
        {
            var inspection = engine.Inspect(target);
            Console.WriteLine(inspection.ToDisplayText());
            return inspection.CanApply || inspection.AlreadyCurrent ? 0 : 3;
        }

        if (command == "--apply")
        {
            var result = engine.Apply(target);
            Console.WriteLine(result);
            return 0;
        }

        Console.Error.WriteLine($"未知命令：{args[0]}");
        return 2;
    }

    private static void TryWriteCrashLog(Exception error)
    {
        try
        {
            File.AppendAllText(
                Path.Combine(AppContext.BaseDirectory, "updater-error.log"),
                $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {error}\r\n",
                Encoding.UTF8
            );
        }
        catch
        {
            // Best-effort diagnostic only.
        }
    }
}

internal sealed class UpdaterForm : Form
{
    private readonly UpdateEngine engine;
    private readonly TextBox targetBox = new() { Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top };
    private readonly TextBox logBox = new()
    {
        Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top | AnchorStyles.Bottom,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Vertical
    };
    private readonly Button checkButton = new() { Text = "检查版本" };
    private readonly Button applyButton = new() { Text = "开始更新" };
    private readonly Button browseButton = new() { Text = "选择目录" };
    private readonly Button launchButton = new() { Text = "启动游戏" };

    public UpdaterForm()
    {
        Text = "茂一杀累积更新器";
        Width = 760;
        Height = 520;
        MinimumSize = new Size(680, 440);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft YaHei UI", 10);
        engine = new UpdateEngine(AppContext.BaseDirectory);

        var title = new Label
        {
            Text = "茂一杀累积更新器",
            AutoSize = true,
            Font = new Font(Font.FontFamily, 16, FontStyle.Bold),
            Left = 18,
            Top = 16
        };
        var note = new Label
        {
            Text = "本更新器不联网。支持从 1.3 及以上旧版按文件校验补齐到当前版本，更新前请先关闭游戏。",
            AutoSize = true,
            Left = 20,
            Top = 54
        };
        var targetLabel = new Label { Text = "游戏目录", AutoSize = true, Left = 20, Top = 92 };

        targetBox.Left = 20;
        targetBox.Top = 118;
        targetBox.Width = ClientSize.Width - 170;
        browseButton.Left = ClientSize.Width - 135;
        browseButton.Top = 116;
        browseButton.Width = 112;
        browseButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;

        checkButton.Left = 20;
        checkButton.Top = 158;
        checkButton.Width = 116;
        applyButton.Left = 148;
        applyButton.Top = 158;
        applyButton.Width = 116;
        launchButton.Left = 276;
        launchButton.Top = 158;
        launchButton.Width = 116;

        logBox.Left = 20;
        logBox.Top = 204;
        logBox.Width = ClientSize.Width - 40;
        logBox.Height = ClientSize.Height - 226;

        Controls.AddRange(new Control[] { title, note, targetLabel, targetBox, browseButton, checkButton, applyButton, launchButton, logBox });

        targetBox.Text = engine.AutoDetectTarget() ?? "";
        browseButton.Click += (_, _) => BrowseTarget();
        checkButton.Click += (_, _) => CheckTarget();
        applyButton.Click += async (_, _) => await ApplyUpdate();
        launchButton.Click += (_, _) => LaunchGame();

        Append(engine.DescribePackage());
        if (!string.IsNullOrWhiteSpace(targetBox.Text)) CheckTarget();
    }

    private void BrowseTarget()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "选择茂一杀游戏目录，也就是包含 茂一杀.exe 和 version.json 的目录。",
            UseDescriptionForTitle = true
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            targetBox.Text = dialog.SelectedPath;
            CheckTarget();
        }
    }

    private void CheckTarget()
    {
        try
        {
            var inspection = engine.Inspect(targetBox.Text);
            Append(inspection.ToDisplayText());
        }
        catch (Exception error)
        {
            Append($"检查失败：{error.Message}");
        }
    }

    private async Task ApplyUpdate()
    {
        SetBusy(true);
        try
        {
            var message = await Task.Run(() => engine.Apply(targetBox.Text));
            Append(message);
            MessageBox.Show(this, message, "茂一杀更新器", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception error)
        {
            Append($"更新失败：{error.Message}");
            MessageBox.Show(this, error.Message, "更新失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void LaunchGame()
    {
        var exe = Path.Combine(targetBox.Text, "茂一杀.exe");
        if (!File.Exists(exe))
        {
            MessageBox.Show(this, "当前目录没有 茂一杀.exe。", "无法启动", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = Path.GetDirectoryName(exe)!, UseShellExecute = true });
    }

    private void SetBusy(bool busy)
    {
        checkButton.Enabled = !busy;
        applyButton.Enabled = !busy;
        browseButton.Enabled = !busy;
        launchButton.Enabled = !busy;
        Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
    }

    private void Append(string message)
    {
        logBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}{Environment.NewLine}");
    }
}

internal sealed class UpdateEngine
{
    private readonly string updaterRoot;
    private readonly string payloadRoot;
    private readonly UpdateManifest manifest;

    public UpdateEngine(string updaterRoot)
    {
        this.updaterRoot = Path.GetFullPath(updaterRoot);
        payloadRoot = Path.Combine(this.updaterRoot, "payload");
        var manifestPath = Path.Combine(this.updaterRoot, "update-manifest.json");
        if (!File.Exists(manifestPath)) throw new FileNotFoundException("更新包缺少 update-manifest.json。", manifestPath);
        manifest = JsonSerializer.Deserialize<UpdateManifest>(File.ReadAllText(manifestPath, Encoding.UTF8), JsonOptions()) ??
                   throw new InvalidOperationException("update-manifest.json 解析失败。");
        manifest.Normalize();
        if (!Directory.Exists(payloadRoot)) throw new DirectoryNotFoundException("更新包缺少 payload 目录。");
    }

    public string DescribePackage()
    {
        var range = string.IsNullOrWhiteSpace(manifest.MinimumVersion)
            ? string.Join(", ", manifest.FromVersions)
            : $"{manifest.MinimumVersion}+";
        return $"累积更新包：{range} -> {manifest.ToVersion}；文件 {manifest.Files.Count} 个，删除 {manifest.DeleteFiles.Count} 个。";
    }

    public string? AutoDetectTarget()
    {
        var candidates = new List<string>
        {
            updaterRoot,
            Directory.GetParent(updaterRoot)?.FullName ?? ""
        };
        var parent = Directory.GetParent(updaterRoot)?.FullName;
        if (!string.IsNullOrWhiteSpace(parent))
        {
            try
            {
                candidates.AddRange(Directory.GetDirectories(parent));
            }
            catch
            {
                // Best-effort detection only.
            }
        }
        return candidates.Where(IsGameDirectory).Distinct(StringComparer.OrdinalIgnoreCase).FirstOrDefault();
    }

    public Inspection Inspect(string targetRoot)
    {
        var target = ValidateTarget(targetRoot);
        var currentVersion = ReadAppVersion(target);
        var versionCompare = CompareVersions(currentVersion, manifest.ToVersion);
        var pendingFiles = manifest.Files.Count(file => !TargetFileMatches(target, file));
        var pendingDeletes = manifest.DeleteFiles.Count(file => File.Exists(SafeCombine(target, file)));
        var sameVersionNeedsRepair = versionCompare == 0 && (pendingFiles > 0 || pendingDeletes > 0);
        var alreadyCurrent = versionCompare >= 0 && !sameVersionNeedsRepair;
        var supported = sameVersionNeedsRepair || IsVersionSupported(currentVersion, alreadyCurrent);
        if (alreadyCurrent)
        {
            pendingFiles = 0;
            pendingDeletes = 0;
        }
        return new Inspection(currentVersion, manifest.ToVersion, EffectiveMinimumVersion(), supported, alreadyCurrent, pendingFiles, pendingDeletes);
    }

    public string Apply(string targetRoot)
    {
        var target = ValidateTarget(targetRoot);
        var inspection = Inspect(target);
        if (inspection.AlreadyCurrent) return $"当前已经是 {manifest.ToVersion}，无需更新。";
        if (!inspection.CanApply)
        {
            var minimum = EffectiveMinimumVersion();
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(minimum)
                    ? $"当前版本 {inspection.CurrentVersion} 不在本更新包支持范围内。支持版本：{string.Join(", ", manifest.FromVersions)}。"
                    : $"当前版本 {inspection.CurrentVersion} 低于本累积更新包最低支持版本 {minimum}，请使用完整 Windows 包。"
            );
        }

        ValidatePayload();
        var fileOps = manifest.Files.Where(file => !TargetFileMatches(target, file)).ToList();
        var deleteOps = manifest.DeleteFiles.Where(file => File.Exists(SafeCombine(target, file))).ToList();
        if (fileOps.Count == 0 && deleteOps.Count == 0) return "文件已经一致，无需替换。";

        CheckWritable(target, fileOps.Select(file => file.Path).Concat(deleteOps));
        var backupDir = CreateBackup(target, inspection.CurrentVersion, manifest.ToVersion);
        var backupRecords = new List<BackupRecord>();

        try
        {
            foreach (var relative in fileOps.Select(file => file.Path).Concat(deleteOps).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var targetFile = SafeCombine(target, relative);
                var existed = File.Exists(targetFile);
                backupRecords.Add(new BackupRecord(relative, existed));
                if (existed)
                {
                    var backupFile = SafeCombine(backupDir, relative);
                    Directory.CreateDirectory(Path.GetDirectoryName(backupFile)!);
                    File.Copy(targetFile, backupFile, overwrite: true);
                }
            }
            File.WriteAllText(Path.Combine(backupDir, "backup-manifest.json"), JsonSerializer.Serialize(backupRecords, JsonOptionsIndented()), Encoding.UTF8);

            foreach (var file in fileOps)
            {
                var source = SafeCombine(payloadRoot, file.Path);
                var targetFile = SafeCombine(target, file.Path);
                Directory.CreateDirectory(Path.GetDirectoryName(targetFile)!);
                var temp = $"{targetFile}.maoyisha-update-tmp";
                File.Copy(source, temp, overwrite: true);
                if (!string.Equals(Sha256(temp), file.Sha256, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException($"更新包文件校验失败：{file.Path}");
                }
                if (File.Exists(targetFile)) File.SetAttributes(targetFile, FileAttributes.Normal);
                File.Move(temp, targetFile, overwrite: true);
            }

            foreach (var relative in deleteOps)
            {
                var targetFile = SafeCombine(target, relative);
                if (File.Exists(targetFile))
                {
                    File.SetAttributes(targetFile, FileAttributes.Normal);
                    File.Delete(targetFile);
                }
            }
        }
        catch
        {
            Rollback(target, backupDir, backupRecords);
            throw;
        }

        return $"更新完成：{inspection.CurrentVersion} -> {manifest.ToVersion}。已备份到 {backupDir}";
    }

    private string ValidateTarget(string targetRoot)
    {
        if (string.IsNullOrWhiteSpace(targetRoot)) throw new InvalidOperationException("请选择茂一杀游戏目录。");
        var target = Path.GetFullPath(targetRoot);
        if (!Directory.Exists(target)) throw new DirectoryNotFoundException($"目录不存在：{target}");
        if (!File.Exists(Path.Combine(target, "version.json"))) throw new FileNotFoundException("所选目录缺少 version.json；请使用完整 Windows 包。");
        return target;
    }

    private static bool IsGameDirectory(string directory)
    {
        return !string.IsNullOrWhiteSpace(directory) &&
               File.Exists(Path.Combine(directory, "version.json")) &&
               File.Exists(Path.Combine(directory, "茂一杀.exe"));
    }

    private static string ReadAppVersion(string target)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(target, "version.json"), Encoding.UTF8));
        if (document.RootElement.TryGetProperty("appVersion", out var appVersion))
        {
            return appVersion.GetString() ?? "";
        }
        if (document.RootElement.TryGetProperty("version", out var version))
        {
            return version.GetString() ?? "";
        }
        return "";
    }

    private bool TargetFileMatches(string target, UpdateFile file)
    {
        var targetFile = SafeCombine(target, file.Path);
        return File.Exists(targetFile) && string.Equals(Sha256(targetFile), file.Sha256, StringComparison.OrdinalIgnoreCase);
    }

    private string EffectiveMinimumVersion()
    {
        if (!string.IsNullOrWhiteSpace(manifest.MinimumVersion)) return manifest.MinimumVersion;
        return manifest.FromVersions
            .Where(version => !string.IsNullOrWhiteSpace(version))
            .OrderBy(version => version, VersionStringComparer.Instance)
            .FirstOrDefault() ?? "";
    }

    private bool IsVersionSupported(string currentVersion, bool alreadyCurrent)
    {
        if (alreadyCurrent) return false;
        var minimum = EffectiveMinimumVersion();
        if (!string.IsNullOrWhiteSpace(manifest.MinimumVersion))
        {
            return CompareVersions(currentVersion, minimum) >= 0 && CompareVersions(currentVersion, manifest.ToVersion) < 0;
        }
        return manifest.FromVersions.Any(version => string.Equals(version, currentVersion, StringComparison.OrdinalIgnoreCase));
    }

    private void ValidatePayload()
    {
        foreach (var file in manifest.Files)
        {
            var source = SafeCombine(payloadRoot, file.Path);
            if (!File.Exists(source)) throw new FileNotFoundException($"更新包缺少 payload 文件：{file.Path}", source);
            var actualSha = Sha256(source);
            if (!string.Equals(actualSha, file.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"更新包 payload 校验失败：{file.Path}");
            }
        }
    }

    private static void CheckWritable(string target, IEnumerable<string> relativePaths)
    {
        foreach (var relative in relativePaths.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var targetFile = SafeCombine(target, relative);
            if (!File.Exists(targetFile)) continue;
            try
            {
                using var stream = new FileStream(targetFile, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                throw new IOException($"文件被占用或无权限写入：{relative}。请关闭游戏后重试。", error);
            }
        }
    }

    private static string CreateBackup(string target, string fromVersion, string toVersion)
    {
        var safeFrom = SanitizeSegment(fromVersion);
        var safeTo = SanitizeSegment(toVersion);
        var stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
        var backupDir = Path.Combine(target, ".maoyisha-backup", $"{safeFrom}-to-{safeTo}-{stamp}");
        Directory.CreateDirectory(backupDir);
        return backupDir;
    }

    private static void Rollback(string target, string backupDir, IEnumerable<BackupRecord> records)
    {
        foreach (var record in records.Reverse())
        {
            var targetFile = SafeCombine(target, record.Path);
            if (record.Existed)
            {
                var backupFile = SafeCombine(backupDir, record.Path);
                if (!File.Exists(backupFile)) continue;
                Directory.CreateDirectory(Path.GetDirectoryName(targetFile)!);
                File.Copy(backupFile, targetFile, overwrite: true);
            }
            else if (File.Exists(targetFile))
            {
                File.SetAttributes(targetFile, FileAttributes.Normal);
                File.Delete(targetFile);
            }
        }
    }

    private static string SafeCombine(string root, string relative)
    {
        var normalized = relative.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        var combined = Path.GetFullPath(Path.Combine(root, normalized));
        var normalizedRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!combined.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase) && !string.Equals(combined, normalizedRoot.TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"非法路径：{relative}");
        }
        return combined;
    }

    private static string Sha256(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private static int CompareVersions(string left, string right)
    {
        var leftParts = ParseVersion(left);
        var rightParts = ParseVersion(right);
        if (leftParts.Count == 0 && rightParts.Count == 0) return 0;
        if (leftParts.Count == 0) return -1;
        if (rightParts.Count == 0) return 1;

        var count = Math.Max(leftParts.Count, rightParts.Count);
        for (var index = 0; index < count; index += 1)
        {
            var leftValue = index < leftParts.Count ? leftParts[index] : 0;
            var rightValue = index < rightParts.Count ? rightParts[index] : 0;
            var compare = leftValue.CompareTo(rightValue);
            if (compare != 0) return compare;
        }
        return 0;
    }

    private static List<int> ParseVersion(string value)
    {
        var parts = new List<int>();
        var current = new StringBuilder();
        foreach (var ch in value.TrimStart('v', 'V'))
        {
            if (char.IsDigit(ch))
            {
                current.Append(ch);
                continue;
            }
            if (current.Length > 0)
            {
                parts.Add(int.Parse(current.ToString()));
                current.Clear();
            }
        }
        if (current.Length > 0) parts.Add(int.Parse(current.ToString()));
        return parts;
    }

    private static string SanitizeSegment(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            builder.Append(invalid.Contains(ch) ? '-' : ch);
        }
        return builder.ToString();
    }

    private static JsonSerializerOptions JsonOptions() => new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private static JsonSerializerOptions JsonOptionsIndented() => new(JsonOptions()) { WriteIndented = true };
}

internal sealed class UpdateManifest
{
    [JsonPropertyName("minimumVersion")]
    public string? MinimumVersion { get; set; }

    [JsonPropertyName("fromVersions")]
    public List<string> FromVersions { get; set; } = new();

    [JsonPropertyName("toVersion")]
    public string ToVersion { get; set; } = "";

    [JsonPropertyName("generatedAt")]
    public string GeneratedAt { get; set; } = "";

    [JsonPropertyName("files")]
    public List<UpdateFile> Files { get; set; } = new();

    [JsonPropertyName("deleteFiles")]
    public List<string> DeleteFiles { get; set; } = new();

    public void Normalize()
    {
        FromVersions ??= new List<string>();
        Files ??= new List<UpdateFile>();
        DeleteFiles ??= new List<string>();
    }
}

internal sealed record UpdateFile(
    [property: JsonPropertyName("path")] string Path,
    [property: JsonPropertyName("size")] long Size,
    [property: JsonPropertyName("sha256")] string Sha256
);

internal sealed record BackupRecord(string Path, bool Existed);

internal sealed record Inspection(string CurrentVersion, string ToVersion, string MinimumVersion, bool Supported, bool AlreadyCurrent, int PendingFiles, int PendingDeletes)
{
    public bool CanApply => Supported && !AlreadyCurrent;

    public string ToDisplayText()
    {
        if (AlreadyCurrent)
        {
            return $"当前版本：{CurrentVersion}；目标版本：{ToVersion}。已是最新，无需更新。";
        }
        if (!CanApply)
        {
            var range = string.IsNullOrWhiteSpace(MinimumVersion) ? "指定旧版本" : $"{MinimumVersion} 及以上";
            return $"当前版本：{CurrentVersion}；目标版本：{ToVersion}。此更新包仅支持 {range}，低于最低版本请使用完整包。";
        }
        return $"当前版本：{CurrentVersion}；目标版本：{ToVersion}。将补齐/替换 {PendingFiles} 个文件，删除 {PendingDeletes} 个废弃文件。";
    }
}

internal sealed class VersionStringComparer : IComparer<string>
{
    public static readonly VersionStringComparer Instance = new();

    public int Compare(string? x, string? y)
    {
        return CompareVersions(x ?? "", y ?? "");
    }

    private static int CompareVersions(string left, string right)
    {
        var leftParts = ParseVersion(left);
        var rightParts = ParseVersion(right);
        if (leftParts.Count == 0 && rightParts.Count == 0) return 0;
        if (leftParts.Count == 0) return -1;
        if (rightParts.Count == 0) return 1;

        var count = Math.Max(leftParts.Count, rightParts.Count);
        for (var index = 0; index < count; index += 1)
        {
            var leftValue = index < leftParts.Count ? leftParts[index] : 0;
            var rightValue = index < rightParts.Count ? rightParts[index] : 0;
            var compare = leftValue.CompareTo(rightValue);
            if (compare != 0) return compare;
        }
        return 0;
    }

    private static List<int> ParseVersion(string value)
    {
        var parts = new List<int>();
        var current = new StringBuilder();
        foreach (var ch in value.TrimStart('v', 'V'))
        {
            if (char.IsDigit(ch))
            {
                current.Append(ch);
                continue;
            }
            if (current.Length > 0)
            {
                parts.Add(int.Parse(current.ToString()));
                current.Clear();
            }
        }
        if (current.Length > 0) parts.Add(int.Parse(current.ToString()));
        return parts;
    }
}
