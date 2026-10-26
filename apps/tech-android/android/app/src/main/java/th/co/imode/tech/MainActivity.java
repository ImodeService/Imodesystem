package th.co.imode.tech;

import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/* The page draws edge to edge on every Android version (Android 15 forces it anyway), and the
   real heights of the status bar and the gesture/navigation bar are handed to the page as the
   CSS variables --safe-t and --safe-b, so nothing sits under the clock or the home bar.
   While the on-screen keyboard is open, --safe-b is the keyboard's height instead.
   The Android WebView does not report env(safe-area-inset-*) reliably, hence this.
   It also guards live updates: a downloaded set of screens that was started twice without saying
   it came up (AppChrome.markGood) is dropped, and the app goes back to the last good set.
   The phone's Back button is handed to the page (window.imodeBack): it closes sheets and goes to the
   previous page, and the app closes only when the page answers 'exit' (Back twice on the first page). */
public class MainActivity extends BridgeActivity {
    private int topPx = 0, bottomPx = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppChromePlugin.class);
        guardUpdate();
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        final WebView web = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            /* the on-screen keyboard counts as bottom inset too, so whatever sits at the bottom
               (chat composer, sheets) moves up above it instead of being covered */
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            topPx = bars.top;
            bottomPx = Math.max(bars.bottom, ime.bottom);
            pushInsets();
            return insets;
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript("window.imodeBack ? window.imodeBack() : 'exit'", r -> {
                    /* the page answers "stay" when it handled Back itself; anything else (no answer, an error) closes the app */
                    if (!"\"stay\"".equals(r)) finish();
                });
            }
        });
    }

    private void guardUpdate() {
        SharedPreferences u = getSharedPreferences(AppChromePlugin.UPD_PREFS, MODE_PRIVATE);
        String trial = u.getString("trial", null);
        if (trial == null) return;
        SharedPreferences cap = getSharedPreferences(AppChromePlugin.CAP_PREFS, MODE_PRIVATE);
        if (!trial.equals(cap.getString(AppChromePlugin.CAP_PATH, ""))) {
            u.edit().remove("trial").putInt("tries", 0).commit();
            return;
        }
        int tries = u.getInt("tries", 0) + 1;
        if (tries <= 2) {
            u.edit().putInt("tries", tries).commit();
            return;
        }
        cap.edit().putString(AppChromePlugin.CAP_PATH, u.getString("good", "")).commit();
        u.edit().putString("badVersion", u.getString("trialVersion", "")).remove("trial").putInt("tries", 0).commit();
    }

    @Override
    public void onResume() {
        super.onResume();
        pushInsets();
        /* back on screen: the page looks for an update and offers it */
        final WebView web = getBridge() == null ? null : getBridge().getWebView();
        if (web != null) web.post(() -> web.evaluateJavascript("window.imodeResume && window.imodeResume()", null));
    }

    /* also called by the page once it has loaded (AppChrome.ready) */
    void pushInsets() {
        final WebView web = getBridge() == null ? null : getBridge().getWebView();
        if (web == null) return;
        float d = getResources().getDisplayMetrics().density;
        final String js = "document.documentElement.style.setProperty('--safe-t','" + Math.round(topPx / d) + "px');"
            + "document.documentElement.style.setProperty('--safe-b','" + Math.round(bottomPx / d) + "px');";
        web.post(() -> web.evaluateJavascript(js, null));
    }
}
