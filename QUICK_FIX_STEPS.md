# GOOGLE_PRIVATE_KEY 修正 - 最速ガイド

## 🚀 問題

Cloud Runの環境変数画面で**改行が入力できない**ため、`GOOGLE_PRIVATE_KEY`が正しく設定できず、
文字起こしが失敗しています。

**エラー:** `error:1E08010C:DECODER routines::unsupported`

## ✅ 解決方法（最も簡単）

### ステップ1: スクリプトを実行

```bash
cd /Users/Yoshi/Desktop/CursorでWebアプリ開発/Darwin-project
./fix-cloud-run-key-simple.sh
```

### ステップ2: 確認メッセージで `y` を入力

```
続行しますか？ (y/N): y
```

### ステップ3: 完了！

デプロイが完了したら（1-2分）、ブラウザで文字起こしをテストしてください。

## 📊 スクリプトの動作

1. ✅ Cloud Runから現在の`GOOGLE_PRIVATE_KEY`を取得
2. ✅ `\n`（エスケープされた改行）を実際の改行に変換
3. ✅ 変換後の値でCloud Runを更新
4. ✅ 自動で再デプロイ

## 🧪 動作確認

### 方法1: APIで確認

```bash
curl -s https://darwin-project-574364248563.asia-northeast1.run.app/api/check-env | python3 -m json.tool
```

`privateKey.status`が`"ok"`になっていればOKです。

### 方法2: 文字起こしをテスト

1. ブラウザで文字起こしページにアクセス
2. 音声ファイルをアップロード
3. 「文字起こしスタート」をクリック
4. エラーが出なければ成功！

## ⚠️ トラブルシューティング

### エラー: "gcloud コマンドが見つかりません"

**対処法:**
```bash
# Google Cloud SDKをインストール
# Macの場合:
brew install --cask google-cloud-sdk

# または公式サイトからダウンロード:
# https://cloud.google.com/sdk/docs/install
```

### エラー: "GOOGLE_PRIVATE_KEY が見つかりません"

**対処法:**

Cloud Runの環境変数に`GOOGLE_PRIVATE_KEY`が設定されていない可能性があります。

1. Google Cloud Consoleで確認:
   https://console.cloud.google.com/run

2. `darwin-project`サービスを選択

3. 「変数とシークレット」タブで`GOOGLE_PRIVATE_KEY`があるか確認

### スクリプトが実行できない

**対処法:**
```bash
# 実行権限を付与
chmod +x fix-cloud-run-key-simple.sh

# 再実行
./fix-cloud-run-key-simple.sh
```

## 📚 代替方法

### 方法2: サービスアカウントキーファイルを使用

サービスアカウントキーJSONファイルがある場合：

```bash
./update-cloud-run-key.sh
```

このスクリプトは：
- JSONファイルから秘密鍵を抽出
- 正しいフォーマットで設定
- 自動検証機能付き

### 方法3: 手動でgcloud CLIを使用

```bash
# 1. 秘密鍵をファイルに保存（改行を含む）
cat > /tmp/private_key.txt << 'EOF'
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
（実際の秘密鍵）
-----END PRIVATE KEY-----
EOF

# 2. Cloud Runを更新
gcloud run services update darwin-project \
  --region asia-northeast1 \
  --update-env-vars "GOOGLE_PRIVATE_KEY=$(cat /tmp/private_key.txt)"

# 3. 一時ファイルを削除
rm /tmp/private_key.txt
```

## 🎯 まとめ

**最も簡単な方法:**
```bash
./fix-cloud-run-key-simple.sh
```

これで完了です！

---

**所要時間:** 約2分
**難易度:** ⭐☆☆☆☆（非常に簡単）
**前提条件:** Google Cloud SDKがインストールされていること

