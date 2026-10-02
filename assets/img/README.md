# 画像スロット

ここにファイルを置くと style.css の `--img-*` トークン経由で自動的に反映されます。
ファイルが無い間は CSS のグラデーションが下地として見えるだけで、レイアウトは崩れません。

| ファイル名 | 使い道 | 推奨サイズ |
|---|---|---|
| hero-battle.jpg | トップのヒーロー (夜の海戦) | 1920×1080 |
| bg-cave.jpg | 全ページ共通の背景 (宝の洞窟) | 1600×1200 |
| scene-treasure.jpg | ランキングの帯 / マイページのヒーロー | 1600×600 |
| scene-jail.jpg | manaba パネルの帯 / 管理画面のヒーロー | 1600×600 |
| scene-tavern.jpg | 学生食堂パネルの帯 | 1600×600 |
| scene-auction.jpg | イベントパネルの帯 | 1600×600 |
| texture-parchment.jpeg | 羊皮紙のテクスチャ (タイル) | 2048×2048 |
| texture-wood.jpeg | 甲板の板のテクスチャ (タイル) | 2048×2048 |
| nav-home.png | 下部メニュー「ホーム」のアイコン | 256×256 |
| nav-mypage.png | 下部メニュー「マイページ」のアイコン | 256×256 |
| nav-admin.png | 下部メニュー「管理」のアイコン | 256×256 |

Firebase Hosting は「ローカルにあるファイル一式」を配信するので、
デプロイ前に必ずこのディレクトリへ配置してください。

---

## 生成プロンプト

共通の世界観: **19世紀の海賊 / 夜 / ランタンの灯り**。
配色は style.css のトークンに合わせる —
夜の藍 `#060d16`、水の青緑 `#1b5d66`、真鍮の金 `#c9922f`、羊皮紙 `#f1e3c4`、炎の橙 `#ff9228`。
全カット共通で末尾に付ける指定:

> painterly oil-painting style, dramatic chiaroscuro lighting, warm lantern glow against deep
> blue-teal night, aged treasure-map atmosphere, no text, no letters, no watermark, no people's
> faces in focus, cinematic, highly detailed

### scene-treasure.jpg — ランキングの帯 / マイページのヒーロー (1600×600)

> A pirate treasure hoard deep inside a cave: mountains of gold coins, spilled jewels, silver
> goblets and an open iron-bound chest overflowing with doubloons. A single hanging lantern casts
> a warm golden pool of light over the gold; the far edges fall into blue-black shadow.
> Wide horizontal composition, the treasure chest slightly left of centre in the upper half,
> foreground of loose coins kept dark and simple.

### scene-jail.jpg — manaba パネルの帯 / 管理画面のヒーロー (1600×600)

> The brig of an old sailing ship: heavy rusted iron bars, damp dark timber walls, a wooden bench,
> chains and a barred porthole letting in cold pale moonlight. One guttering candle on the floor
> adds a small warm glow. Cold, grey-blue, oppressive mood — the darkest image of the set.
> Wide horizontal composition, bars filling the frame, empty cell, nobody inside.

### scene-tavern.jpg — 学生食堂パネルの帯 (1600×600)

> A rowdy harbour tavern interior at night: long worn oak tables, pewter tankards of ale, roast
> meat and bread on wooden platters, barrels stacked against the wall, fishing nets and a ship's
> wheel on the timber wall. Candles and hanging oil lanterns fill the room with warm amber light.
> Wide horizontal composition, the laden table across the middle, seen from a standing height,
> warm and inviting — the brightest image of the set.

### scene-auction.jpg — イベントパネルの帯 (1600×600)

> A night-time black-market auction on a stone quay beside moored sailing ships: a raised wooden
> platform, an auctioneer's gavel and podium, crates and an opened chest of curiosities displayed
> under torchlight, a crowd of silhouetted buyers with raised hands seen only as dark shapes from
> behind. Torches and a hanging lantern light the platform; ship masts and rigging in the
> background against a deep blue night sky. Wide horizontal composition, festive and charged.

### texture-parchment.jpeg — 羊皮紙テクスチャ (2048×2048, タイル)

> A seamless tileable old parchment paper texture: fine irregular fibre grain, faint mottling and
> soft blotches, very subtle creases. Flat even lighting, no shadows, no edges, no border, no
> stains at the corners, no text. **Almost white, very light warm grey — very low contrast.**
> Seamless tiling, top edge matches bottom edge and left edge matches right edge.

### texture-wood.jpeg — 甲板の板テクスチャ (2048×2048, タイル)

> A seamless tileable weathered ship-deck wood texture: straight horizontal grain, fine cracks and
> knots, salt-worn planking. Flat even lighting, no shadows, no plank gaps at the edges, no nails
> at the corners, no text. **Light neutral greyscale, very low contrast.**
> Seamless tiling, top edge matches bottom edge and left edge matches right edge.

### 技術的な注意

- **scene-*.jpg** は CSS で高さ 70〜108px の帯に `background-position: center 42%` で切り抜かれ、
  下端は羊皮紙色へのグラデーションで潰れます。主題は**上寄り・横長**に。文字は入れないこと
  （帯の上に見出しが重なります）。
- **texture-*** は `background-blend-mode: multiply` で下地の色に乗算されます。
  濃い色で作ると全体が真っ黒になるので、**必ず明るい低コントラストのグレー**で生成してください。
  また `repeat` でタイルするので、**継ぎ目のない (seamless) こと**が必須です。

---

## 下部メニューのアイコン

CSS の `mask-image` で使うので、**見えるのは形(アルファチャンネル)だけ**です。
色は CSS 側が当てるため、画像の色は白でも黒でも結果は変わりません。
これにより、選択中に色が変わる挙動を画像のままで維持できます。

- 形式: **PNG、背景は完全な透過**
- サイズ: 256×256 (実際の表示は約20px)
- 中身: **単色のベタ塗りシルエット1つ**。グラデーション・影・光彩・縁取りは入れない
  (どれもアルファに残ってしまい、20pxでは滲んだ汚れに見えます)
- 余白: 四辺に10%ほど空ける。端に接すると切れて見えます
- 線の太さ: 最も細い部分でも256px中10px以上。これを下回ると20pxで消えます

### 生成プロンプト

> A single flat silhouette icon of {MOTIF}, solid pure white shape on a fully transparent
> background, centered with even margins, no gradient, no shadow, no glow, no outline,
> no background shape, no text, bold simple form readable at 20 pixels, app navigation icon

`{MOTIF}` を差し替えてください。

| ファイル | {MOTIF} |
|---|---|
| nav-home.png | `a compass rose` (羅針盤) |
| nav-mypage.png | `a pirate doubloon coin` (ダブロン金貨) |
| nav-admin.png | `an anchor` (錨) または `an old iron key` (鍵) |

### 生成した画像の置き場

Gemini などが出力した元ファイルは、名前のまま **`assets/img/src/`** に置いてください。
`firebase.json` の ignore に入れてあるので本番には配信されません。
そこから透過PNG (256×256) に変換して `assets/img/` 直下に置いたものが実際に使われます。

変換は「図形は輝度235以上、焼き込まれた市松模様は180以下」で切り分けています。
この2つの帯が重なるような画像 (図形がグレー、背景が明るい等) だと分離できないので、
**図形は必ず純白**にしてください。

---

## スロットの絵柄 (assets/img/slot/)

ゲームタブのスロットで、リールに並ぶ絵柄。**`assets/img/slot/<ファイル名>` に置くだけで差し替わります**
(置いていない絵柄は絵文字で代わりに出ます)。

- 形式: **JPEG (拡張子 .jpeg)、正方形 (1:1)**。いまは 2048×2048
- 表示: 角丸のタイルいっぱいに `object-fit: cover` で敷きます。**枠・角丸・文字は CSS 側で付ける**ので、画像には入れない
- 背景: 透過にはせず、**全部の絵柄で同じ深い青緑のグラデーション**にする (タイルの下地 `#1f5560 → #0b2227` と同じ)
- 大きさ: スマホでは 1マス約 80px まで縮むので、**シルエットと色だけで見分けがつく**こと。絵柄は画面の7割ほどの大きさで中央に
- 格: 高い絵柄 (宝箱・金貨・羅針盤) ほど光と輝きを強く、低い絵柄 (オウム・錨) は落ち着かせる

### 全カット共通で末尾に付ける指定

> square 1:1 image, a single slot machine reel symbol, one object centered and filling about 70% of the
> frame, rich painterly game-icon illustration with a crisp readable silhouette, warm lantern rim light,
> pirate treasure theme, background: smooth deep teal radial gradient (#1f5560 in the center fading to
> #0b2227 at the edges) filling the whole square, no border, no frame, no rounded corners, no text,
> no letters, no numbers, no watermark

### 絵柄ごとの前半

| ファイル | 絵柄 (倍率) | プロンプト |
|---|---|---|
| chest.jpeg | 宝箱 (×100・最高) | An open iron-bound wooden pirate treasure chest overflowing with gleaming gold doubloons, pearls and red and green jewels, strong golden light bursting out of the chest, sparkles |
| coin.jpeg | 金貨 (×30) | One large gold doubloon coin seen at a slight three-quarter angle, embossed with a crown and cross, thick polished rim, bright gold shine with a star glint |
| compass.jpeg | 羅針盤 (×15) | An antique brass navigation compass with an open hinged lid, ivory dial with a red and black needle, polished brass reflecting warm light |
| map.jpeg | 宝の地図 (×8) | A half-unrolled old parchment treasure map with a bold red X mark and a dotted path over a small island, curled torn edges, tied with a red wax seal |
| rum.jpeg | ラム酒 (×5) | A squat dark green glass rum bottle with a cork and dripping red wax seal, amber rum glowing inside, a strong warm rim light outlining the bottle so it stands out from the dark background |
| parrot.jpeg | オウム (×3) | A scarlet macaw parrot, head and upper body in profile, vivid red, yellow and blue feathers, bright eye, friendly look |
| anchor.jpeg | 錨 (×2・最低) | A heavy iron ship anchor with a thick hemp rope wrapped around the shank, weathered steel grey with soft highlights |
| wild.jpeg | ドクロ旗 (ワイルド) | A fluttering black Jolly Roger pirate flag with a white skull and crossed cutlasses, surrounded by a glowing golden aura and small embers so the black flag stands out from the dark background, magical and special |

ドクロ旗には CSS で下に小さく「WILD」の札を重ねるので、画像の下端 15% ほどには大事なものを置かないでください。

宝探しの盤面の船長マスの絵も、同じ形式・同じ共通の末尾でここに置きます (スロットには出ません)。
置いていないあいだは、赤い札に「船長」と書いて出します。特定の映画の登場人物に似ないよう、人物ではなく帽子にしています。

| ファイル | 絵柄 | プロンプト |
|---|---|---|
| captain.jpeg | 船長 (宝探しのジャックポットのマス) | A black felt pirate captain's tricorn hat with ornate gold braid trim and a large crimson feather plume, a small gold anchor emblem pinned on the front, resting on a crimson velvet cushion with gold tassels, surrounded by a glowing red and gold aura with small embers so it stands out as a special prize, majestic and special, original design, no person, no face |

## 成り上がりの大きなボタン (assets/img/nariagari/)

ゲームタブの成り上がりで、第4弾 (JP)・第5弾 (SJP) を回すときに画面の真ん中に出す丸いボタン。
**`assets/img/nariagari/<ファイル名>` に置くだけで差し替わります** (置いていないあいだは CSS の赤い玉・七色の玉で出ます)。

- 形式: **JPEG (拡張子 .jpeg)、正方形 (1:1)、2048×2048**
- 表示: 縁まで描いてある絵をそのまま出し、外側だけ丸くぼかして消す。「PUSH」と「JP 第4弾」などの文字は、CSS でボタンの下に出す。**画像には文字を入れない**
- 背景: 外側はぼかして消すので、ボタンの外は夜の藍の深いグラデーションにしておく
- 第5弾のほうを、第4弾よりはっきり派手にする

### 共通で末尾に付ける指定

> square 1:1 image, one large round push button seen from directly above, perfectly centered and filling about 85% of
> the frame, rich painterly game-UI illustration with a crisp readable silhouette, pirate treasure theme, background:
> smooth deep teal-black radial gradient (#0b2227 in the center fading to #060d16 at the edges) filling the whole square,
> no text, no letters, no numbers, no watermark

| ファイル | 使い道 | プロンプト (前半) |
|---|---|---|
| jp-button.jpeg | 第4弾 (JP) を回すボタン | A big glossy domed push button made of deep ruby-red glass, with a glowing golden skull and crossed cutlasses emblem floating inside the glass, set in a thick engraved brass ring with rivets and a rope-twist border, warm lantern light reflecting on the dome, a red and gold glow and small embers around the rim, exciting and powerful |
| sjp-button.jpeg | 第5弾 (SJP) を回すボタン (もっと派手に) | A huge legendary domed push button made of radiant golden crystal glowing from within, with a royal crown above an open treasure chest emblem inside, set in a thick ornate gold ring studded with emeralds, sapphires and rubies, rainbow light rays bursting out behind it, sparkling gold coins and jewels flying around the rim, dazzling divine light, the most special and luxurious button imaginable |

## 公式キャラクター (船長) (assets/img/captain/)

Q-Jong の公式キャラ。名前は**ハク**で、航海 (大海賊の航海日誌、assets/img/voyage/) の主人公と同じ人物 (20歳ほどの若い船長。一人称は「俺」)。**`assets/img/captain/<ファイル名>` に置くだけで出ます** (無いあいだは出さず、いまの見た目のまま)。
**出し始めるのは 2026/10/4 0:00 (JST)** から (`assets/js/common.js` の `CAPTAIN_REVEAL_AT`)。それより前は置いてあってもどこにも出さない (通知のアイコンは firebase-messaging-sw.js と functions/index.js に同じ日時がある)。
いまの絵は Gemini で作った4枚 (元の画像は `assets/img/src/captain/` にある。サイトには配信しない) から作った。
Gemini は背景透過の画像を出せないので、**明るい無地 (羊皮紙色) の背景で作ってもらい、`tools/cutout-parchment.py` で背景を透明にする**。

| ファイル | 中身 | 出るところ |
|---|---|---|
| stand.png | 全身・背景透過 (original-stand.jpeg を `FLOOR=0.14` で切り抜き) | ホームの見出し (吹き出しでひとこと)・宝探しの船長チャンスのカットイン |
| surprised.png | 驚きの顔 (original-sheet.jpeg の下の段の3つ目) | 成り上がりの JP 突入 |
| laugh.png | 大笑いの顔 (同じく2つ目) | 成り上がりの SJP 突入・スロットのジャックポットタイム突入・宝探しのジャックポット当たり |
| disappointed.png | がっかりの顔 (同じく5つ目) | 宝探しのジャックポットを逃したとき |
| face.jpeg | 笑顔 (同じく1つ目) を青緑のグラデーションに置いた 1024×1024 | 宝探しの船長マス (無ければ slot/captain.jpeg の帽子) |
| icon.png | face.jpeg を 512×512 にしたもの | 通知のアイコン (サイトのタブ・ホーム画面のアイコン assets/icon.png と、iOS アプリのアイコンは別) |
| halloween.png | ハロウィン版の全身・背景透過 (original-halloween.jpeg を `FLOOR=0.14` で切り抜き) | ハロウィンのあいだ (日本時間で毎年 10/18〜10/31) だけ、stand.png の代わりに出る (ホームの見出し・宝探しの船長チャンスのカットイン)。期間は common.js の `isHalloweenSeason` |

設定画の顔の切り出し: `KEEP_MAIN=1 python3 tools/cutout-parchment.py assets/img/src/captain/original-sheet.jpeg 出力.png x0 1590 x1 2048`
(顔の中心 x は 242・633・1024・1415・1806。x0 = 中心 − 215、x1 = 中心 + 245)

### 全身 (stand / halloween) のプロンプト

> Original official mascot character for a pirate-themed game app: a cheerful, confident young pirate captain (a young man, around 20 years old), full body, dynamic heroic standing pose, front three-quarter view, holding a gleaming gold doubloon between two fingers like a casino chip, slight friendly grin. Outfit: black felt tricorn hat with ornate gold braid trim and a crimson feather, a polished round brass compass badge on the front of the hat; deep navy long coat with brass buttons and gold embroidery; crimson sash around the waist; cream linen shirt; brown leather belt with a rolled treasure map and a small brass spyglass; tall brown leather boots. Mahjong motif: a small ivory mahjong tile dangling as an earring, and a few ivory mahjong tiles tucked into the crimson sash. Sidekick: a small scarlet macaw parrot perched on one shoulder. Color palette: deep navy and teal-black, brass gold (#c9922f), crimson (#9b2321), parchment cream (#f1e3c4), warm lantern-orange accents. Style: high-quality anime-inspired character illustration, clean dark outlines with rich painterly shading, warm lantern rim light, crisp readable silhouette. Background: plain flat light parchment-cream color only, no scenery, no ground shadow. Original design, not resembling any existing character or real person. No text, no letters, no logo, no watermark.

ハロウィン版 (halloween.png) は、元の全身の画像を参考に渡して次で頼む:

> Halloween version of the same pirate captain mascot from the reference image: full body, same face and hairstyle, same heroic standing pose and framing. Outfit restyled for Halloween: black-and-deep-purple long coat with pumpkin-orange trim and small pumpkin-shaped brass buttons, the black tricorn hat decorated with a tiny jack-o'-lantern badge and little bat wings, an orange-and-purple striped sash with ivory mahjong tiles, holding a carved jack-o'-lantern lantern glowing warm orange instead of the coin. The scarlet macaw on the shoulder wears a tiny witch hat. A couple of small cute bats near the hat. Playful, spooky but friendly mood. Color palette: deep purple, pumpkin orange, black, brass gold. Anime-inspired illustration with clean dark outlines and painterly shading. Background: plain flat light parchment-cream color only, no scenery, no mist, no ground shadow. No text, no letters, no watermark.

### 表情 (個別に作り直すとき)

> Waist-up portrait of the same pirate captain mascot from the reference image, same face, outfit and colors, the scarlet macaw on the shoulder reacting the same way, anime-inspired illustration with clean dark outlines and painterly shading, warm lantern rim light. Background: plain flat light parchment-cream color only, no shadow. No text, no watermark.

表情ごとに後ろへ足す:

- surprised: `eyes wide open and mouth open in shock and excitement, leaning forward, one hand raised in amazement`
- laugh: `laughing out loud with a huge open-mouthed grin, eyes squeezed shut with joy, holding up a gold doubloon triumphantly`
- disappointed: `slumped shoulders, frowning with a heavy sigh, looking down at an empty open palm, the parrot drooping too`
