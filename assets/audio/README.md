# 音源スロット

ここにファイルを置くと再生されます。無い間は何も起きず、エラーも出ません
（コンソールに警告が出るだけで、画面や他の機能には影響しません）。

| ファイル名 | 鳴らし方 | 実装 |
|---|---|---|
| home-hero-doubletap.mp3 | ホーム画面上部のヒーロー画像を**ダブルタップ** (もう一度で止める) | `assets/js/main.js` の末尾 (`HERO_AUDIO_SRC`) |
| slot-jackpot-time.mp3 | スロットのジャックポットタイム突入のカットイン | `assets/js/game-slot.js` の `showJackpotCutin` |
| nariagari-jp-button.mp3 | 成り上がりの JP (第4弾) のボタンを押したとき | `assets/js/game-nariagari.js` の `pressNariagariBigButton` |
| nariagari-sjp-button.mp3 | 成り上がりの SJP (第5弾) のボタンを押したとき | 同上 |
| nariagari-up.mp3 | 成り上がりで UP に止まったとき | `assets/js/game-nariagari.js` の `presentNariagariPlay` |
| nariagari-jp-spin-loop.mp3 | 成り上がりの JP (第4弾) の抽選中。盤面が止まるまで 1.75〜4.2秒の区間を繰り返す | 同上 |
| nariagari-sjp-spin-loop.mp3 | 成り上がりの SJP (第5弾) の抽選中。盤面が止まるまで 0.5〜4.0秒の区間を繰り返す | 同上 |
| gappori-drawing-loop.mp3 | 宝探しの抽選中。抽選が始まってから5球が出そろうまで、2.255〜10.255秒 (4小節) の区間を、つなぎ目を 0.04秒重ねて繰り返す (曲の終わりのフェードアウトと無音は使わない) | `assets/js/game-gappori.js` の `updateGapporiDrawSound` |
| gappori-ball.mp3 | 宝探しで球が出たとき (1球ごと)。自分の券のお宝ではないマス (船長・ほかのお宝)、券を買っていないとき | `assets/js/game-gappori.js` の `revealGapporiBalls` |
| gappori-ball-hit.mp3 | 宝探しで球が自分の券のお宝のマスに入ったとき (1球ごと。gappori-ball.mp3 の代わりに鳴らす) | 同上 |
| gappori-finish.mp3 | 宝探しの全部の抽選 (5球と、船長の回は JP ルーレットも) が終わったとき | `assets/js/game-gappori.js` の `celebrateGapporiResult` |
| gappori-captain-cutin.mp3 | 宝探しの船長チャンスのカットイン | `assets/js/game-gappori.js` の `celebrateGapporiResult` |
| gappori-jackpot-win.mp3 | 宝探しの JP ルーレットでジャックポット・ドクロ旗が当たったカットイン | 同上 |
| gappori-jackpot-miss.mp3 | 宝探しの JP ルーレットがハズレのとき | 同上 |
| blackjack-deal.mp3 | ブラックジャックでカードを配るとき (1枚ごと。めくるときは鳴らさない) | `assets/js/game-blackjack.js` の `renderCardRow` |

55.11 で、何の音かがわかる名前に変えた (前の名前: hero → home-hero-doubletap、a → slot-jackpot-time、b → nariagari-jp-button、
c → nariagari-sjp-button、d → nariagari-up、e → gappori-captain-cutin、f → blackjack-deal、g → gappori-jackpot-win、
h → gappori-jackpot-miss、1 → nariagari-jp-spin-loop、2 → nariagari-sjp-spin-loop、3 → gappori-drawing-loop、
4 → gappori-ball、5 → gappori-ball-hit、6 → gappori-finish。55.11 では 4 を unused-gappori-ball-short、5 を gappori-ball にしていたのを 55.12 で直した)。

home-hero-doubletap 以外はゲームの効果音で、鳴らす仕組みは `assets/js/game-sound.js` にまとめてあります
(名前とファイルの対応は `GAME_SOUNDS`)。通信や回転のあと (タップの直後でないとき) に鳴らすため、
Web Audio を使い、ゲーム画面で最初にタップしたときに音を出せる状態にしてまとめて読み込みます。
読み込む前やファイルが無いときは鳴らないだけで、ゲームはそのまま動きます。

## 置くときの注意

- **必ずこのディレクトリに置いてコミットすること。**
  `firebase.json` の hosting は `public: "."` なので、配信されるのは
  「ローカルにあるファイル一式」です。本番へ直接アップロードしても、
  次のデプロイでローカルに無いファイルは消えます。
- ファイル名は上の表のとおりにすること。変える場合は `assets/js/game-sound.js` の `GAME_SOUNDS`
  (ホームの音は `main.js` の `HERO_AUDIO_SRC`) も直してください。
- mp3 はページ読み込み時には取得せず、**最初にダブルタップされた時点で**
  初めてダウンロードします。多少大きくても通常の表示は遅くなりません。

## 端末ごとの癖

- **iPhone / iPad**: 本体横のサイレントスイッチがオンだと鳴りません。
  これはブラウザの仕様で、コード側では回避できません。
- ブラウザは「ユーザーの操作なしの自動再生」を禁止していますが、
  ダブルタップは操作とみなされるため再生できます。
- 鳴らない場合はブラウザのコンソールを確認してください。
  ファイルが無い・形式が読めない場合は警告が出ます。
