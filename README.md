# PicCut

ブラウザで使える 16:5 固定アスペクト比の画像切り抜きツールです。`jpg` / `jpeg` / `png` を読み込み、表示用キャンバス上の切り抜き枠をドラッグして位置調整し、その範囲を元画像座標で正しくクロップして保存します。

## 機能

- `jpg` / `jpeg` / `png` を読み込み
- キャンバスに画像を表示
- 16:5 固定比率の切り抜き枠を表示
- マウスやタッチで枠をドラッグ移動
- 枠が画像外に出ないよう制約
- 元画像座標でクロップして保存
- オプションで `640x200` にリサイズして保存

## ローカル起動

静的ファイルだけなので、任意のHTTPサーバーで起動できます。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開いてください。

## GitHub Pages で公開する

このリポジトリには `.github/workflows/deploy-pages.yml` が入っているので、`main` に push すれば GitHub Actions 経由で GitHub Pages にデプロイできます。

1. GitHub に公開リポジトリを作成
2. このディレクトリを `main` ブランチで push
3. GitHub の `Settings` -> `Pages`
4. `Source` を `GitHub Actions` に設定
5. `main` への push 後、Actions が成功すると公開 URL が発行されます

## 実装メモ

- 表示用キャンバスはレスポンシブに縮小表示
- 画像の表示領域 `imageBounds` と切り抜き枠 `cropRect` を別管理
- 保存時は `naturalWidth` / `naturalHeight` と表示領域の比率から元画像座標へ逆変換
