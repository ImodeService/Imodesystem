# I-MODE แอพทีมช่าง (Android)

Capacitor 7 app with its own light screens in `www/` (no framework): sign in, งานของฉัน, หน้างาน
(step bar, Check-in with GPS, step back, รออะไหล่), theme picker with the web system's five presets.
It uses the same Supabase project and rows as the web system (`www/config.js` = `shared/config.js`,
anon key only; RLS protects the data). Step changes update only `field_status`,
`field_status_log`, `status`, `updated_at` of `service_cases` and post one line to `case_messages`.

Safe areas: MainActivity draws edge to edge and passes the status/navigation bar heights to the
page as `--safe-t` / `--safe-b`; `AppChrome.setBars` picks light or dark bar icons.

Build a test APK on Windows (Node, Android SDK, JDK 21):

    npm install
    npx cap sync android
    cd android && gradlew.bat assembleDebug

Output: android/app/build/outputs/apk/debug/app-debug.apk

## Updates without a new APK

The app checks `https://imodeservice.github.io/Imodesystem/apps/tech-android/www/version.json`
on start and when it comes back to the screen. If that version is newer than `VERSION` in
`www/app.js`, the native side (AppChromePlugin.downloadBundle) downloads the listed files, checks
every SHA-256, keeps them under the app's files/bundles/<version>, and serves the app from there
from the next start (or at once when the technician taps เริ่มใหม่). Unchanged files are copied,
not downloaded. A set that is started twice without reaching `markGood` is dropped and the app
goes back to the previous set (MainActivity.guardUpdate). Installing a newer APK always starts
from the files inside the APK.

To release an update:

1. change files in `www/`, raise `VERSION` in `www/app.js`
2. `node tools/make-version.js` (writes `www/version.json`)
3. push to the Imodesystem repo; GitHub Pages serves it within a few minutes

Raise `NATIVE` in app.js and AppChromePlugin.java (and build a new APK) only when the screens
need native code the installed APK does not have; older APKs then tell the user to install the
new one instead of updating. Raise `versionCode` / `versionName` in android/app/build.gradle for
every APK.
