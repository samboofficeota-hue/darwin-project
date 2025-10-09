# Cloud Run 文字起こし処理 - 調査結果と修正方法

## 🎯 調査結果

### ✅ 良いニュース

1. **Cloud Run上のAPIは正常に動作しています**
   - `/api/transcribe-chunks` - ジョブ開始API ✅
   - `/api/audio-transcription-status` - ステータス取得API ✅
   - フロントエンドからの接続も成功 ✅

2. **フロントエンドのコードは正しい**
   - チャンクのアップロードは成功しています
   - ジョブの作成も成功しています
   - Cloud Storage へのファイル保存も成功しています

### ❌ 問題点

**GOOGLE_PRIVATE_KEYのフォーマットエラー**

エラーメッセージ：
```
error:1E08010C:DECODER routines::unsupported
```

これは、Cloud Runの環境変数`GOOGLE_PRIVATE_KEY`の改行文字が正しく設定されていないため、
Google Cloud Speech APIが秘密鍵をデコードできない状態です。

## 🔧 修正方法

### 方法1: 自動変換ツールを使用（推奨）

```bash
# プロジェクトディレクトリで実行
python3 format-private-key.py
```

このツールは：
- サービスアカウントキーJSONから秘密鍵を抽出
- 正しいフォーマットに変換
- フォーマットの検証
- Cloud Runに貼り付ける内容を表示

### 方法2: 手動で修正

#### ステップ1: 現在の設定を確認

Cloud Runの環境変数画面で`GOOGLE_PRIVATE_KEY`の値を確認：

**現在（間違い）:**
```
-----BEGIN PRIVATE KEY----- MIIEvglBADANBgkqhk...
```

#### ステップ2: 正しいフォーマットに変更

**正しいフォーマット:**
```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
（複数行に分割された秘密鍵本体）
...
-----END PRIVATE KEY-----
```

**重要:** Cloud Runの環境変数エディタで、**実際の改行を含めて**貼り付けてください。

#### ステップ3: デプロイ

1. Google Cloud Console にアクセス
   https://console.cloud.google.com/run

2. `darwin-project` サービスを選択

3. 「編集してデプロイ」をクリック

4. 「変数とシークレット」タブで `GOOGLE_PRIVATE_KEY` を編集

5. 正しいフォーマットの秘密鍵を貼り付け

6. 「デプロイ」をクリック

7. デプロイ完了まで待機（1-2分）

## 🧪 修正後の確認

### ステップ1: APIテスト

```bash
# テストジョブを作成
curl -X POST https://darwin-project-574364248563.asia-northeast1.run.app/api/transcribe-chunks \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "sessionId": "test_session",
    "chunks": []
  }'
```

レスポンスに`jobId`が含まれていれば成功です。

### ステップ2: ブラウザでテスト

1. ブラウザで `http://localhost:3000/chunked-transcribe` にアクセス

2. 音声ファイルを選択

3. 「クラウドへ送る」をクリック

4. アップロード完了後、「文字起こしスタート」をクリック

5. 結果ページに遷移して、進捗が表示されることを確認

### ステップ3: エラーがないことを確認

結果ページで、エラーメッセージに以下が含まれていないことを確認：
- `DECODER routines::unsupported`
- `Failed to connect`
- `Authentication failed`

## 📊 処理フロー（修正後）

```
[ブラウザ]
    │
    ├─1─> チャンク分割
    │
    ├─2─> Cloud Storage にアップロード
    │      （署名付きURL経由）
    │
    ├─3─> Cloud Run: /api/transcribe-chunks
    │      ↓
    │      ジョブを作成
    │      ↓
    │      各チャンクを処理
    │      ├─> Cloud Storage からダウンロード
    │      ├─> Google Cloud Speech API で文字起こし
    │      └─> Redis にステータス保存
    │
    └─4─> Cloud Run: /api/audio-transcription-status
           ↓
           ステータス取得（3秒ごとにポーリング）
           ↓
           完了したら結果を表示
```

## 📝 チェックリスト

### 修正前

- [x] Cloud Run上のAPIが動作していることを確認
- [x] フロントエンドのコードが正しいことを確認
- [x] 問題がGOOGLE_PRIVATE_KEYであることを特定

### 修正作業

- [ ] `python3 format-private-key.py` を実行
- [ ] 正しいフォーマットの秘密鍵を取得
- [ ] Cloud Runの環境変数を更新
- [ ] デプロイを実行
- [ ] デプロイ完了を待機

### 修正後

- [ ] APIテストで成功することを確認
- [ ] ブラウザで文字起こしをテスト
- [ ] エラーが発生しないことを確認
- [ ] 結果が正しく表示されることを確認

## 🎉 期待される結果

修正後、以下のようになります：

1. ✅ チャンクが正常にアップロードされる
2. ✅ 文字起こしジョブが開始される
3. ✅ 進捗が3秒ごとに更新される
4. ✅ 各チャンクが順次処理される
5. ✅ 完了後、文字起こし結果が表示される
6. ✅ テキストの編集・ダウンロードが可能

## 🆘 サポート

問題が解決しない場合は、以下の情報を提供してください：

1. `format-private-key.py`の実行結果
2. Cloud Runのデプロイログ
3. ブラウザのコンソールログ
4. `/api/audio-transcription-status`のレスポンス

## 📚 関連ドキュメント

- `FIX_GOOGLE_PRIVATE_KEY.md` - 詳細な修正手順
- `CLOUD_RUN_DEPLOY_GUIDE.md` - Cloud Runデプロイガイド
- `ENV_CHECK_GUIDE.md` - 環境変数チェックガイド

---

**更新日:** 2025-10-09
**ステータス:** 修正待ち（GOOGLE_PRIVATE_KEYの更新が必要）
**優先度:** 高

