# 羊皮紙色 (明るい無地) の背景の絵から、背景を透明にした PNG を作る。公式キャラ (船長) の絵に使った。
#   Gemini などは背景透過の画像を出せないので、明るい無地の背景で作ってもらい、これで切り抜く。
#   外周から背景の色をたどって透明にし、輪郭のそばは色の差でなだらかに透かして、色から背景の色を抜く
#   (暗い背景に置いても白いふちが出ないように)。人物とつながらない小さなシミは消す。
#
#   使い方:
#     python3 tools/cutout-parchment.py 入力.jpeg 出力.png                 # 全体を切り抜く
#     python3 tools/cutout-parchment.py 入力.jpeg 出力.png x0 y0 x1 y1     # 範囲を切り出してから切り抜く
#   環境変数:
#     FLOOR=0.14   下から何割を床とみなし、床の影 (紙より少し暗い色) も背景にする (全身の立ち絵向け)
#     KEEP_MAIN=1  いちばん大きいかたまり以外で、切り出した範囲の端に触れているもの (隣の絵のはみ出し) を消す
#   例 (ホームの立ち絵): FLOOR=0.14 python3 tools/cutout-parchment.py assets/img/src/captain/original-stand.jpeg assets/img/captain/stand.png
#   例 (設定画の顔):     KEEP_MAIN=1 python3 tools/cutout-parchment.py assets/img/src/captain/original-sheet.jpeg assets/img/captain/laugh.png 418 1590 878 2048
#   必要なもの: Python 3 と numpy・scipy・Pillow
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src = sys.argv[1]
dst = sys.argv[2]
im = Image.open(src).convert('RGB')
if len(sys.argv) >= 7:
    x0, y0, x1, y1 = map(int, sys.argv[3:7])
    im = im.crop((x0, y0, x1, y1))
a = np.asarray(im).astype(np.float32)
h, w, _ = a.shape

# 背景の色: 四辺の帯の中央値
band = np.concatenate([a[:12].reshape(-1, 3), a[-12:].reshape(-1, 3), a[:, :12].reshape(-1, 3), a[:, -12:].reshape(-1, 3)])
bg = np.median(band, axis=0)

def dist_to(color):
    return np.sqrt(((a - color) ** 2).sum(axis=2))

d = dist_to(bg)
T_LOW, T_HIGH = 22.0, 70.0
# 背景らしい画素のうち、外周につながっているかたまり = 背景
cand = d < T_LOW + 14
# 床の影 (下の帯にある、紙より少し暗い色) も背景にする。影で両足のあいだの紙が外とつながる
FLOOR = float(__import__('os').environ.get('FLOOR', '0'))   # 下から何割を床とみなすか (0 なら床なし)
if FLOOR > 0:
    ys = np.arange(h)[:, None]
    cand |= (d < 130) & (ys > h * (1 - FLOOR))
labels, n = ndimage.label(cand)
border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
bgmask = np.isin(labels, list(border))

# 背景の色を場所ごとに見積もる (紙のむら・影): 背景の画素だけをぼかして広げる
weight = ndimage.gaussian_filter(bgmask.astype(np.float32), 12)
local = np.stack([ndimage.gaussian_filter(a[..., c] * bgmask, 12) for c in range(3)], axis=2) / np.maximum(weight[..., None], 1e-3)
local = np.where(weight[..., None] > 0.02, local, bg)
dl = np.sqrt(((a - local) ** 2).sum(axis=2))

# 透明度: 背景からは 0、輪郭のそば (背景から 4px 以内) は色の差でなだらかに、内側は 1
near = ndimage.binary_dilation(bgmask, iterations=4)
alpha = np.ones((h, w), np.float32)
alpha[bgmask] = 0.0
edge = near & ~bgmask
alpha[edge] = np.clip((dl[edge] - T_LOW) / (T_HIGH - T_LOW), 0, 1)

# 小さなシミ (人物とつながっていない小さなかたまり) を消す
fg = alpha > 0.5
labels2, n2 = ndimage.label(fg)
if n2:
    sizes = ndimage.sum(fg, labels2, range(1, n2 + 1))
    keep = np.zeros(n2 + 1, bool)
    biggest = sizes.max()
    keep[1:] = sizes >= max(400, biggest * 0.002)
    alpha[~keep[labels2] & fg] = 0.0
    # 半透明の小さなにじみも消す
    alpha[(alpha <= 0.5) & ~ndimage.binary_dilation(keep[labels2], iterations=3)] = 0.0

# KEEP_MAIN=1: いちばん大きいかたまり以外で、切り出した範囲の端に触れているもの (隣の絵のはみ出し) を消す
if __import__('os').environ.get('KEEP_MAIN') == '1':
    fg = alpha > 0.3
    labels3, n3 = ndimage.label(fg)
    if n3 > 1:
        sizes = ndimage.sum(fg, labels3, range(1, n3 + 1))
        main = int(np.argmax(sizes)) + 1
        edge_labels = set(np.unique(np.concatenate([labels3[0], labels3[-1], labels3[:, 0], labels3[:, -1]]))) - {0, main}
        drop = np.isin(labels3, list(edge_labels))
        drop = ndimage.binary_dilation(drop, iterations=3) & (labels3 != main)
        alpha[drop] = 0.0

# 色から背景の色を抜く (暗い背景に置いても白いふちが出ないように)
al = alpha[..., None]
fgc = np.where(al > 0.01, (a - (1 - al) * local) / np.maximum(al, 1e-3), a)
fgc = np.clip(fgc, 0, 255)
out = np.dstack([fgc, alpha * 255]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
# 余白を切る (透明なところ)
bbox = img.getbbox()
if bbox:
    pad = 8
    img = img.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad)))
img.save(dst)
print(dst, img.size, 'bg', bg.round(1))
