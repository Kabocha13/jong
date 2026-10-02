# 航海 (大海賊の航海日誌) の絵

ここにあるもの (アップロードされた絵から切り出した):

| ファイル | 使い道 |
|---|---|
| captain.png | ハクの全身 (物語の予備。いまは使っていない) |
| face-smile.png / face-laugh.png / face-surprise.png / face-angry.png / face-sad.png | ハクの表情 (盤の真ん中・物語・船長チャンス) |
| parrot.png | ポン (盤のコマ・物語) |
| coin.png | 金貨 1715 (呪いの金貨のマスの演出) |
| mob.png・chun.png・hatsu.png | 酒場の男・チュン・ハツ (物語。元の画像は assets/img/src/voyage/original-*.jpeg を tools/cutout-parchment.py で切り抜き) |
| bg-01.jpeg〜bg-12.jpeg | 各章の背景 (第1章 SILI港の酒場 〜 最終日 開いた扉の向こうの金) |
| board.jpeg | 盤の真ん中 (サイコロを振るところ) の背景 |
| sq-storm.jpeg・sq-loss.jpeg | 盤のマス「嵐」「災難」の絵 |

絵はすべてそろっている。作り直すときは、同じ名前で置き換えるだけでよい。

共通の世界観は assets/img/README.md と同じ (19世紀の海賊 / 夜 / ランタンの灯り)。
人物は face-*.png と同じタッチ (アニメ調、太めの線) にそろえると物語の中で浮かない。

---

## 背景 (bg-01.jpeg 〜 bg-12.jpeg)

### 画面での出かた (構図の注意)

- 物語の画面いっぱいに `object-fit: cover` で敷き、ゆっくり寄っていく。
  **スマホ (縦長) では真ん中の縦 1/4 ほどしか見えない**ので、主題は必ず**中央**に置く。
- 人物は**左右の端**に立ち (ハクが左、チュン・ハツ・ポンが右)、**下 1/4 は台詞の枠と字幕**が重なる。
  さらに下半分は CSS で黒く沈める。主題は**中央・やや上**、左右と下は控えめに (暗い帯にはしない)。
- 人物は上から重ねるので、**背景には人を描かない**。
- 拡張子は **.jpeg** (コードが `bg-01.jpeg` の名前で読む。.jpg や .png では出ない)。
- **画面の区切り・枠・縦線を描かせない**。「中央の帯だけで分かるように」などと書くと、
  Gemini が左右を暗くした帯と縦線を絵の中に描いてしまう (最初の bg-01 がそうなった)。

### 全カット共通で末尾に付ける指定

> widescreen 16:9 anime film background art, hand-painted look with soft painterly detail and clean
> readable shapes, cinematic lighting, no people, no characters, no animals, no text, no letters,
> no numbers, no watermark. One single continuous scene filling the whole frame edge to edge, with
> natural even lighting across it: no panels, no split screen, no borders, no frames, no dividing
> lines, no darkened side bands. The main subject sits in the middle of the picture, in the center
> and upper half; the sides and the lower third hold only quiet secondary details.

### 章ごとの前半

---

## 盤のマスの絵

盤の30マスは、スロットの絵柄 (`assets/img/slot/`) などをそのまま使って描いている (game-voyage.js の `VG_ART`)。

| マス | 絵 |
|---|---|
| 港 | slot/anchor.jpeg |
| 金貨 ×1.5〜×3 (第1・11章は酒場) | slot/coin.jpeg (第1・11章は slot/rum.jpeg) |
| おこぼれ ×0.5 | slot/coin.jpeg を暗くして |
| 拿捕 ×6 など ×5 以上・宝箱 | slot/chest.jpeg |
| ×? (古地図・掘る) | slot/map.jpeg |
| もう1回 | slot/parrot.jpeg |
| 追い風 | slot/compass.jpeg |
| 一騎打ち | slot/wild.jpeg |
| 呪いの金貨 | voyage/coin.png |
| 船長 | captain/face.jpeg (10/4 より前は slot/captain.jpeg の帽子) |
| 嵐 | voyage/sq-storm.jpeg |
| 災難 | voyage/sq-loss.jpeg |


### sq-storm.jpeg・sq-loss.jpeg の作り方

スロットの絵柄と同じ形式 (**JPEG、正方形 2048×2048、深い青緑のグラデーションの背景**) にすると、ほかのマスと並べて浮かない。
マスは小さい (スマホで 1マス 約 45px) ので、**シルエットと色だけで見分けがつく**ようにする。
マスでは絵を少し拡大して切り抜くので、**絵柄は真ん中に 7割ほどの大きさ**で。

全カット共通で末尾に付ける指定:

> square 1:1 image, a single board game square icon, one object centered and filling about 70% of the
> frame, rich painterly game-icon illustration with a crisp readable silhouette, warm lantern rim light,
> pirate treasure theme, background: smooth deep teal radial gradient (#1f5560 in the center fading to
> #0b2227 at the edges) filling the whole square, no border, no frame, no rounded corners, no text,
> no letters, no numbers, no watermark

| ファイル | マス | プロンプト (前半) |
|---|---|---|
| sq-storm.jpeg | 嵐 (戻る) | A small dark storm cloud with a swirling grey waterspout twisting down beneath it, a jagged white lightning bolt and slanting rain streaks, cold blue-grey light with a bright white rim so it stands out from the dark teal background, ominous but readable |
| sq-loss.jpeg | 災難 (さらに 10 失う) | A cracked wooden cargo crate bursting open with flying splinters, a few gold coins spilling out and tumbling away, a sharp red-orange burst of light behind it, a feeling of sudden loss, strong silhouette |

---

## 盤の真ん中の絵 (board.jpeg)

サイコロ・ハクの顔・「振る」ボタンが乗る、盤の真ん中 (とマスの隙間) の背景。全章で同じ1枚を使い、
CSS がその上に章の色を半分くらい重ね、周りを少し暗くする (`style.css` の `.vg-board` と `--img-voyage-board`)。
章ごとの雰囲気 (霧の灰色・幽霊船の紫・氷の水色など) は、その章の色で出る。

- 形式: **JPEG、正方形 2048×2048**。`background-size: cover` で敷くので、PC (横長の盤) では上下が、スマホ (縦長の盤) では左右が切れる。大事なものは**真ん中**に
- 上にサイコロ・白い文字・ボタンが乗るので、**暗めで、明暗の差が小さい**絵にする (明るいと文字が読めない)
- 文字 (方位の N・E・S・W も) は入れない

> Top-down view of a calm night ocean seen from directly above, deep blue-teal water with soft painterly
> ripples and a few faint moonlight glints, overlaid with the thin, faded golden lines of an antique nautical
> chart: one large ornate compass rose in the center (drawn with lines and points only, without any letters)
> and fine rhumb lines radiating out to the edges, like an old sea map floating on the water. Dark and low in
> contrast overall, a little darker toward the edges, so dice, white text and buttons placed on top stay easy
> to read. Square 1:1 image, rich painterly game-art illustration for a pirate treasure board game, no ships,
> no land, no islands, no people, no animals, no text, no letters, no numbers, no watermark

