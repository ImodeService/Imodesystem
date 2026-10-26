package th.co.imode.tech;

import android.content.Context;
import android.content.SharedPreferences;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Iterator;
import java.util.regex.Pattern;
import org.json.JSONObject;

/* What the page cannot do by itself:
   - pick dark or light status/navigation bar icons, and ask for the safe-area sizes again;
   - live update: fetch a newer set of screen files (listed with SHA-256 in version.json, published
     with the web system), keep it under files/bundles/<version>, and serve the app from it.
     Files that did not change are copied from the set in use instead of downloaded.
     MainActivity drops a new set that never confirms it started (markGood). */
@CapacitorPlugin(name = "AppChrome")
public class AppChromePlugin extends Plugin {
    /* raise when a release needs native code this APK does not have; version.json "native" */
    static final int NATIVE = 1;
    static final String BASE = "https://imodeservice.github.io/Imodesystem/apps/tech-android/www/";
    static final String CAP_PREFS = "CapWebViewSettings", CAP_PATH = "serverBasePath";
    static final String UPD_PREFS = "imode_update";
    private static final Pattern SAFE = Pattern.compile("^[A-Za-z0-9_\\-]+(/[A-Za-z0-9_\\-.]+)*\\.[A-Za-z0-9]+$");
    private static final Pattern VER = Pattern.compile("^[0-9]{1,4}(\\.[0-9]{1,4}){0,3}$");

    @PluginMethod
    public void setBars(PluginCall call) {
        final boolean statusDark = Boolean.TRUE.equals(call.getBoolean("statusDark", false));
        final boolean navDark = Boolean.TRUE.equals(call.getBoolean("navDark", false));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(statusDark);
            c.setAppearanceLightNavigationBars(navDark);
        });
        call.resolve();
    }

    @PluginMethod
    public void ready(PluginCall call) {
        if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).pushInsets();
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("native", NATIVE);
        r.put("path", capPath());
        r.put("bad", upd().getString("badVersion", ""));
        call.resolve(r);
    }

    /* the running set started fine: keep it as the one to fall back to */
    @PluginMethod
    public void markGood(PluginCall call) {
        SharedPreferences u = upd();
        String cur = capPath();
        SharedPreferences.Editor e = u.edit().remove("trial").putInt("tries", 0).putString("good", cur);
        String trial = u.getString("trial", null);
        if (trial != null && trial.equals(cur)) e.remove("badVersion");
        e.apply();
        call.resolve();
    }

    @PluginMethod
    public void downloadBundle(PluginCall call) {
        final String version = call.getString("version", "");
        final String manifest = call.getString("manifest", "");
        new Thread(() -> {
            try {
                if (!VER.matcher(version).matches()) throw new Exception("bad version");
                if (version.equals(upd().getString("badVersion", ""))) throw new Exception("version " + version + " failed to start before");
                JSONObject m = new JSONObject(manifest);
                if (!version.equals(m.optString("version"))) throw new Exception("version mismatch");
                JSONObject files = m.getJSONObject("files");
                if (!files.has("index.html")) throw new Exception("no index.html");
                File root = new File(getContext().getFilesDir(), "bundles");
                File tmp = new File(root, version + ".part");
                deleteTree(tmp);
                if (!tmp.mkdirs()) throw new Exception("cannot write");
                String cur = capPath();
                Iterator<String> it = files.keys();
                while (it.hasNext()) {
                    String path = it.next();
                    String want = files.getString(path).toLowerCase();
                    if (!SAFE.matcher(path).matches() || path.contains("..") || path.equals("version.json")) throw new Exception("bad path " + path);
                    if (!want.matches("^[0-9a-f]{64}$")) throw new Exception("bad hash " + path);
                    byte[] data = readLocal(cur, path);
                    if (data == null || !sha256(data).equals(want)) {
                        data = fetch(BASE + path + "?v=" + want.substring(0, 12));
                        if (!sha256(data).equals(want)) throw new Exception("checksum " + path);
                    }
                    File out = new File(tmp, path);
                    File dir = out.getParentFile();
                    if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new Exception("cannot write " + path);
                    try (FileOutputStream o = new FileOutputStream(out)) { o.write(data); }
                }
                try (FileOutputStream o = new FileOutputStream(new File(tmp, "version.json"))) { o.write(manifest.getBytes(StandardCharsets.UTF_8)); }
                File dest = new File(root, version);
                deleteTree(dest);
                if (!tmp.renameTo(dest)) throw new Exception("cannot finish");
                /* keep the new set, the one in use and the fallback; drop the rest */
                String good = upd().getString("good", "");
                File[] all = root.listFiles();
                if (all != null) for (File f : all) {
                    String p = f.getAbsolutePath();
                    if (!p.equals(dest.getAbsolutePath()) && !p.equals(cur) && !p.equals(good)) deleteTree(f);
                }
                JSObject r = new JSObject();
                r.put("path", dest.getAbsolutePath());
                call.resolve(r);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        }).start();
    }

    /* use a downloaded set: from the next start, or now (reloads the page) */
    @PluginMethod
    public void applyBundle(PluginCall call) {
        final String path = call.getString("path", "");
        final boolean now = Boolean.TRUE.equals(call.getBoolean("now", false));
        File root = new File(getContext().getFilesDir(), "bundles");
        File dir = new File(path);
        File parent = dir.getParentFile();
        if (parent == null || !parent.getAbsolutePath().equals(root.getAbsolutePath()) || !new File(dir, "index.html").isFile()) {
            call.reject("bad bundle");
            return;
        }
        String version = dir.getName();
        getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_PATH, path).commit();
        upd().edit().putString("trial", path).putString("trialVersion", version).putInt("tries", 0).commit();
        call.resolve();
        if (now) getActivity().runOnUiThread(() -> getBridge().setServerBasePath(path));
    }

    private SharedPreferences upd() { return getContext().getSharedPreferences(UPD_PREFS, Context.MODE_PRIVATE); }

    private String capPath() {
        String p = getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).getString(CAP_PATH, "");
        return p == null ? "" : p;
    }

    private byte[] readLocal(String base, String path) {
        try {
            if (base != null && !base.isEmpty()) {
                File f = new File(base, path);
                if (!f.isFile()) return null;
                try (InputStream in = new FileInputStream(f)) { return readAll(in); }
            }
            try (InputStream in = getContext().getAssets().open("public/" + path)) { return readAll(in); }
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] fetch(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setUseCaches(false);
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode() + " " + url);
            try (InputStream in = c.getInputStream()) { return readAll(in); }
        } finally {
            c.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        return b.toByteArray();
    }

    private static String sha256(byte[] data) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(data);
        StringBuilder s = new StringBuilder();
        for (byte x : d) s.append(String.format("%02x", x));
        return s.toString();
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
