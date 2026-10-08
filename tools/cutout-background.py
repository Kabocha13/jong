# 背景が描き込まれた絵 (白・市松模様・青緑) を、周りからつながった背景だけ透明にして切り抜き、絵のある範囲で切り詰めた PNG にする。
# 使い方: python3 tools/cutout-background.py 元の絵.jpeg 出す.png white|checker|teal
# (58.6 で HL のボタンとレートのコインに使った。元の絵は assets/img/src/hl/ に残す)
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

def cutout(src, dst, kind, pad=8):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    if kind == 'white':      # 白い背景 (と薄い影)
        bg = (sat < 0.10) & (mx > 0.80)
    elif kind == 'checker':  # 市松模様 (色の無い灰色)
        bg = (sat < 0.10) & (mx > 0.16)
    elif kind == 'teal':     # 青緑の背景
        bg = (b > r + 0.02) & (g > r - 0.02) & (sat > 0.15)
    # 周りからつながった背景だけ (内側の同じ色は残す)
    labels, _ = ndimage.label(bg)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    back = np.isin(labels, list(edge))
    if kind == 'white':
        # 飾りのすき間に閉じこめられた白も背景 (絵の中にこれほど白い大きな部分は無い)
        holes = (sat < 0.08) & (mx > 0.90)
        lab2, n2 = ndimage.label(holes)
        sizes = ndimage.sum(holes, lab2, range(1, n2 + 1))
        big = np.isin(lab2, [i + 1 for i, size in enumerate(sizes) if size > 400])
        back = back | big
        fg = ~back
    else:
        fg = ndimage.binary_fill_holes(~back)
    fg = ndimage.binary_opening(fg, iterations=2)
    erode = {'white': 2, 'checker': 3, 'teal': 18}[kind]
    fg = ndimage.binary_erosion(fg, iterations=erode)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert('RGBA'); out.putalpha(alpha)
    ys, xs = np.nonzero(fg)
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad + 1), min(im.height, ys.max() + pad + 1))
    out = out.crop(box)
    out.save(dst)
    print(dst, out.size)

cutout(sys.argv[1], sys.argv[2], sys.argv[3])
