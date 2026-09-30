// 画面の拡大・縮小を止める (ダブルタップ・2本指とも)。
// iPhone は viewport の user-scalable=no を無視することがあるので、ピンチの操作 (gesture*) と
// 2本指での移動もここで止める。CSS の touch-action (style.css) と viewport の指定と合わせて使う
(function () {
    const stop = event => event.preventDefault();
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
        document.addEventListener(type, stop, { passive: false });
    });
    document.addEventListener('touchmove', event => {
        if (event.touches.length > 1) event.preventDefault();
    }, { passive: false });
}());
