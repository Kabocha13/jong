# スロットのジャックポットの立体物

ジャックポットの演出で、画面の端から奥行きをつけて飛び込んでくる絵です。
このフォルダに置くだけで使われます (コードの変更はいりません)。置いていない名前は使いません。

## ファイル名

「出てくる向き-番号.png」で置きます。向きごとに3枚まで (番号は 1〜3)。
いまは左右の6枚 (left-1 宝箱・left-2 大砲・left-3 舵輪・right-1 ラム酒の樽・right-2 大きな金貨・right-3 望遠鏡) だけを使う。
left-2 (大砲)・left-3 (舵輪)・right-3 (望遠鏡) は宝探しのお宝の絵にも使っている (game-slot.js の SLOT_SYMBOLS の cannon・helm・telescope)。差し替えると宝探しの絵も変わる。
上・下からも出せる作りだが、絵を置かないことにしたので探さない (使うなら game-slot.js の SLOT_PROP_SIDES に 'top'・'bottom' を足す)。

| 向き | ファイル名 | 止まる位置 |
|---|---|---|
| 左から | left-1.png 〜 left-3.png | 左端の上の帯 → 下の帯 → 真ん中の端から半分のぞかせる |
| 右から | right-1.png 〜 right-3.png | 右端の同じ順 |

## 絵の作り方

- 背景を透過した PNG。正方形に近い形 (800×800 くらい) で、物の周りに少し余白を残す
- 立体感のある物を1つ (宝箱・大砲・錨・舵輪・ドクロ・金貨の山・ラム酒の樽 など)。斜めから見た形だと奥行きが出る
- 画面では 130〜280px ほどの大きさで出る。影と金色の光は CSS で付けるので、絵に影を描かなくてよい
- 圧縮はしない (生成したサイズのまま置く)

## 出る場面

- ジャックポットタイム突入: 置いてある全部が左右から飛び込む (約3.4秒)
- ジャックポットタイム中の当たり: 1つ (大当たり ×20 以上は3つ。なるべく違う向きから)
- ジャックポットタイム終了 (払い戻しがあったとき): 置いてある全部

置いたら `firebase deploy --only hosting` で反映されます。

## 生成プロンプト

Gemini などは背景透過の画像を出せないので、公式キャラ (船長) と同じく**明るい無地 (羊皮紙色) の背景で作り、
`tools/cutout-parchment.py` で背景を透明にする**。元の画像は `assets/img/src/props/original-left-1.jpeg` などの名前で置く
(`assets/img/src/` は本番に配信されない)。

```
python3 tools/cutout-parchment.py assets/img/src/props/original-left-1.jpeg assets/img/slot/props/left-1.png
```

舵輪のように物に囲まれた背景 (スポークのあいだ) があるときは `HOLES=1` を付ける (外とつながっていない背景も抜く)。

背景と同じような薄い色 (白っぽい金・クリーム色) が物の縁にあると、背景と一緒に抜けてしまう。
共通の指定で「濃い輪郭線」と「背景より濃い色」を入れてある。

### 全カット共通で末尾に付ける指定

> square 1:1 image, one single object only, shown in a dramatic three-quarter perspective with strong depth so it looks
> like a 3D game asset flying toward the viewer, glossy highlights and warm lantern rim light, rich painterly
> game-asset illustration with a clean dark outline and a crisp readable silhouette, the object clearly darker and more
> saturated than the background, the whole object fully inside the frame with about 10% empty margin on every side,
> pirate treasure theme. Background: plain flat light parchment-cream color only (#f1e3c4), no scenery, no ground,
> no cast shadow, no glow on the background. No text, no letters, no numbers, no logo, no watermark.
