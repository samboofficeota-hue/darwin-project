# 環境変数チェックガイド

## 🎯 現在の状況

あなたのログを分析した結果：

### ✅ 良いニュース
- チャンクは正しくアップロードされています
- ジョブが正常に作成されています：`success: true`
- 処理自体は**成功している**ようです

### ⚠️ 問題点
- ブラウザが**古いコード**（Cloud Run URL）をキャッシュしています
- コードは修正されましたが、ブラウザが更新されていません

## 🔧 解決手順

### ステップ1: サーバーの再起動

```bash
# 1. 現在のサーバーを停止（Ctrl+C）
# 2. サーバーを再起動
npm run dev
```

### ステップ2: ブラウザのキャッシュクリア

**ハードリロード:**
- Mac: `Command + Shift + R`
- Windows: `Ctrl + Shift + R`

**完全なキャッシュクリア:**
- Chrome: `Command + Shift + Delete`（Mac）
- 「キャッシュされた画像とファイル」を選択してクリア

### ステップ3: 環境変数のチェック

#### 方法1: APIエンドポイントで確認

**ローカル環境:**
```bash
http://localhost:3000/api/check-env
```

**Cloud Run:**
```bash
https://darwin-project-574364248563.asia-northeast1.run.app/api/check-env
```

#### 方法2: 自動チェックスクリプトを使用

```bash
./check-env.sh
```

このスクリプトは自動的にローカルとCloud Run両方をチェックします。

## 📊 チェック結果の見方

### 正常な場合
```json
{
  "overallStatus": "ok",
  "checks": {
    "privateKey": {
      "status": "ok",
      "message": "Private key is properly configured"
    }
  }
}
```

### エラーがある場合
```json
{
  "overallStatus": "error",
  "checks": {
    "privateKey": {
      "status": "error",
      "message": "Private key does not contain newline characters",
      "details": {
        "hasNewlines": false,
        "hasEscapedNewlines": true
      }
    }
  }
}
```

## 🔍 よくあるエラーと対処法

### エラー1: "Private key contains escaped newlines"

**原因:** `GOOGLE_PRIVATE_KEY`が正しくフォーマットされていない

**対処法:**

`.env.local`で以下のように設定：

```bash
# ❌ 間違い
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEv...\\n-----END PRIVATE KEY-----\\n"

# ✅ 正しい
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
-----END PRIVATE KEY-----"
```

または、1行で書く場合：
```bash
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

### エラー2: "Bucket does not exist"

**原因:** バケット名が間違っているか、バケットが存在しない

**対処法:**
1. Google Cloud Consoleでバケットを確認
2. `.env.local`の`GCS_BUCKET_NAME`を確認
3. Cloud Runの環境変数と一致しているか確認

### エラー3: "Failed to connect to Google Cloud Storage"

**原因:** 認証情報が間違っている

**対処法:**
1. `GOOGLE_CLIENT_EMAIL`が正しいか確認
2. `GOOGLE_PRIVATE_KEY`が正しいか確認
3. サービスアカウントに適切な権限があるか確認

## 📝 環境変数チェックリスト

### 必須環境変数

- [ ] `KV_REST_API_URL` - Redis URL
- [ ] `KV_REST_API_TOKEN` - Redis トークン
- [ ] `GCS_BUCKET_NAME` - Cloud Storageバケット名
- [ ] `GOOGLE_CLOUD_PROJECT_ID` - GCPプロジェクトID
- [ ] `GOOGLE_CLIENT_EMAIL` - サービスアカウントメール
- [ ] `GOOGLE_PRIVATE_KEY_ID` - 秘密鍵ID
- [ ] `GOOGLE_PRIVATE_KEY` - 秘密鍵（最重要）
- [ ] `GOOGLE_CLIENT_ID` - クライアントID

### GOOGLE_PRIVATE_KEY の要件

- [ ] ダブルクォートで囲まれている
- [ ] `-----BEGIN PRIVATE KEY-----` で始まる
- [ ] `-----END PRIVATE KEY-----` で終わる
- [ ] 改行文字（`\n`または実際の改行）が含まれている
- [ ] エスケープされた改行（`\\n`）が含まれていない
- [ ] 1700文字以上の長さがある

## 🚀 次のステップ

### 1. 環境変数の確認
```bash
# サーバーを起動
npm run dev

# 別のターミナルで
./check-env.sh
```

### 2. エラーがある場合
- チェック結果のエラーメッセージを確認
- 該当する環境変数を修正
- サーバーを再起動

### 3. エラーがない場合
- ブラウザのキャッシュをクリア
- `http://localhost:3000/chunked-transcribe` にアクセス
- 文字起こしを再テスト

## 💡 デバッグのヒント

### ブラウザのコンソールを確認

正しく更新されていれば、以下のログが表示されるはずです：

```
Sending to local API: 
{url: '/api/transcribe-chunks', ...}
```

**もし以下のログが表示される場合は、まだキャッシュが残っています：**

```
Sending to Cloud Run: 
{url: 'https://darwin-project-574364248563.asia-northeast1.run.app/api/transcribe-chunks', ...}
```

### サーバーログを確認

ターミナルで以下のようなログが表示されるはずです：

```
=== Transcribe Chunks API Called ===
Request body: {...}
Chunks count: 32
```

## 📞 サポート

問題が解決しない場合は、以下の情報を提供してください：

1. `/api/check-env` の出力結果
2. ブラウザのコンソールログ
3. サーバーのターミナルログ
4. 具体的なエラーメッセージ

---

**更新日:** 2025-10-09

