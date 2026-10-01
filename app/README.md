# Q-Jong iOS アプリ (app/)

Capacitor で作った iOS アプリ。中身は本番のサイト `https://q-jong.web.app` をアプリの中でそのまま開くだけで、
HTML・JS・画像はアプリに入れていない (`capacitor.config.json` の `server.url`)。
そのため Web を `firebase deploy` すれば、アプリの中身もそのまま新しくなる。作り直しが要るのは、アプリの殻
(アイコン・起動画面・設定) を変えたときと、TestFlight のビルドが 90 日で切れるときだけ。

Android はアプリにせず、ブラウザ (とホーム画面に追加した PWA) で使う。あとで作るときは `npx cap add android`。

## ファイル

| 場所 | 中身 |
| --- | --- |
| `capacitor.config.json` | アプリの設定。Bundle ID (`appId`)・アプリ名・開く URL・背景色 |
| `www/index.html` | 本番のサイトを開けなかったときの控えの画面 (Capacitor の決まりで必要) |
| `ios/App/App/Info.plist` | アプリ名・縦向きだけ・ステータスバーは白い文字・暗号化の申告 (`ITSAppUsesNonExemptEncryption` = false。通信は HTTPS だけ) |
| `ios/App/App/Assets.xcassets` | アイコン (`assets/icon.png` をそのまま) と起動画面 (紺の背景に角丸のアイコン) |
| `ios/App/App/AppDelegate.swift` | 通知の登録結果と届いた通知を、通知のプラグインへ渡す |
| `ios/App/App/App.entitlements` | 通知 (`aps-environment`)。Archive して App Store Connect へ出すときは Xcode が production にする |
| `ios/App/App/GoogleService-Info.plist` | Firebase の iOS アプリ (Q-Jong iOS) の設定。git には入れない (下の「初めて / ほかの Mac で開くとき」で取り直す) |

入っているネイティブの機能 (プラグイン) は2つ。サイトの JavaScript から `window.Capacitor.Plugins.<名前>` で呼ぶ
(アプリがページの読み込み前に入れてくれるので、プラグインの JS は読み込まない。判定は `assets/js/common.js` の `isNativeApp` / `nativePlugin`)。

| プラグイン | 使っているところ |
| --- | --- |
| `@capacitor-firebase/messaging` (FirebaseMessaging) | 通知。マイページの「この端末で通知を受け取る」で許可をもらい、FCM のトークンを `push_tokens` に置く (`assets/js/mypage.js`)。通知をタップすると、通知に付いたページを開く (`assets/js/common.js`) |
| `@capacitor/haptics` (Haptics) | スロットのジャックポットタイムの振動 (`assets/js/game-slot.js` の `buzz`)。ブラウザでは震わせない |

`app/` は Web のホスティングに上げない (`firebase.json` の hosting の ignore に `app/**`)。

## 初めて / ほかの Mac で開くとき

```sh
cd app
npm install
npx cap sync ios      # 設定 (capacitor.config.json) を Xcode のプロジェクトへ写す。設定を変えたら毎回
# Firebase の iOS 設定を取り直す (git に入れていないため)
npx firebase apps:sdkconfig IOS 1:882274773075:ios:48771739d32f1675fb3ea6 --project q-jong --out ios/App/App/GoogleService-Info.plist
npx cap open ios      # Xcode で開く
```

Swift Package Manager が Firebase の部品をダウンロードするときに「already exists in file system」で止まったら、
もう一度 File → Packages → Resolve Package Versions をする (並行ダウンロードがぶつかるだけで、2回目は通る)。

## 通知を届けるための準備 (最初に一度だけ)

1. Apple Developer → Certificates, Identifiers & Profiles → Keys →「＋」で「Apple Push Notifications service (APNs)」に
   チェックを入れてキーを作り、.p8 ファイルをダウンロードする (一度しかダウンロードできない)。Key ID と Team ID を控える
2. Firebase コンソール → プロジェクトの設定 → Cloud Messaging →「Apple アプリの構成」の Q-Jong iOS に、
   .p8 と Key ID・Team ID を「APNs 認証キー」としてアップロードする
3. Xcode の「Signing & Capabilities」に Push Notifications と Background Modes (Remote notifications) が出ているか確かめる。
   出ていなければ「＋ Capability」で足す

これをしないと、アプリで通知を許可してトークンを登録しても、通知は届かない。

## TestFlight (内部テスト) に出す

1. App Store Connect で「マイ App」→「＋」→「新規 App」。プラットフォーム iOS、Bundle ID は `com.kabocha13.qjong`
   (先に Certificates, Identifiers & Profiles で登録しておくか、Xcode の自動署名で作られたものを選ぶ)。
   Bundle ID を変えるなら、登録する前に `capacitor.config.json` の `appId` と Xcode の Bundle Identifier を揃えて変える
2. Xcode で App ターゲット →「Signing & Capabilities」→ Team を選ぶ (Automatically manage signing のまま)
3. 上の実行先を「Any iOS Device (arm64)」にして、Product → Archive
4. Organizer で「Distribute App」→「App Store Connect」→ アップロード
5. App Store Connect の TestFlight → 内部テストのグループにテスターを足す
   (内部テスターは App Store Connect のチームのユーザーである必要がある。最大100人。審査なし)

ビルドは 90 日で使えなくなる。その前に `ios/App/App.xcodeproj` の Build (`CURRENT_PROJECT_VERSION`) を 1 つ上げて、
3〜4 をやり直す。

## 通知の流れ

- サーバー (`functions/index.js` の `pushMessage`) は、ブラウザ・PWA (Web プッシュ) と iOS アプリ (APNs) の両方に届く形で FCM に送る。
  アプリには音を鳴らし、同じ種類の通知は1つにまとめる (`apns-collapse-id`)。タップしたときに開くページは `data.link`
- ブラウザ・ホーム画面の PWA で登録している人は、これまでどおり Web プッシュで届く
- アプリで登録すると、同じ人の iPhone の Web プッシュ (PWA) のトークンは外す (同じ通知が2回届かないように)
- アプリの中のページは、ユーザーエージェントの末尾に `QJongApp` が付く (`appendUserAgent`)
