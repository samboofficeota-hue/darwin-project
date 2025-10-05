# Darwin Project - 智の泉

公益資本主義で経済社会システムをアップデートしていくための「智の泉」

## プロジェクト概要

このプロジェクトは、公益資本主義の理念に基づいて日本や世界の経済社会システムをアップデートするための知識ベースシステムです。Vimeo動画や音声ファイルから高精度な文字起こしを行い、構造化された講義録を自動生成します。

## 主要機能

### 1. Vimeo動画文字起こしシステム

- **長時間動画対応**: 数時間の講演動画を自動で文字起こし
- **チャンク分割処理**: 5分単位で分割して安定した処理を実現
- **中断・再開機能**: 処理が中断されても途中から再開可能
- **リアルタイム進捗表示**: 処理状況をリアルタイムで確認

### 2. ファイルアップロード文字起こし

- **多形式対応**: MP3, WAV, MP4, M4A等の音声・動画ファイル
- **大容量対応**: 最大2GBのファイルサイズに対応
- **高精度処理**: Google Speech-to-Text APIによる高精度文字起こし

### 3. 講義録生成システム

- **HTML講義録**: 美しいHTML形式での講義録自動生成
- **メタデータ管理**: 講演者情報、講義テーマ、統計情報を含む
- **構造化データ**: 時間スタンプ付きの詳細な文字起こし結果

### 4. 統合インターフェース

- **ステップ形式**: 講義情報入力 → URL検証 → 処理 → 結果表示
- **Vimeo URL検証**: 動画の存在確認とメタデータ取得
- **進捗管理**: ジョブIDによる処理状況の追跡

## 技術スタック

### フロントエンド
- **Next.js 14**: React フレームワーク
- **TypeScript**: 型安全な開発
- **Tailwind CSS**: モダンなUIデザイン
- **Vercel**: デプロイメント・ホスティング

### バックエンド
- **Google Cloud Run**: サーバーレス実行環境
- **Google Speech-to-Text API**: 高精度音声認識
- **Upstash Redis**: 状態管理・ジョブ管理
- **Vimeo API**: 動画メタデータ取得

### 開発環境
- **Cursor IDE**: AI支援開発環境
- **Node.js 18+**: 実行環境

## プロジェクト構造

```
darwin-project/
├── src/app/                  # Next.js App Router
│   ├── page.tsx             # ホームページ
│   ├── transcribe/          # ファイルアップロード文字起こし
│   ├── vimeo-transcribe/    # Vimeo動画文字起こし
│   ├── lecture-transcribe/  # 統合インターフェース
│   └── lecture-record/      # 講義録表示
├── pages/api/               # API エンドポイント
│   ├── transcribe.js        # 音声文字起こしAPI
│   ├── vimeo-transcribe.js  # Vimeo文字起こしAPI
│   ├── validate-vimeo-url.js # Vimeo URL検証
│   └── transcription-status.js # 進捗確認API
├── lib/                     # ユーティリティ
│   ├── storage.js          # Redis状態管理
│   └── text-processor.js   # テキスト処理
├── public/                  # 静的ファイル
└── vercel.json             # Vercel設定
```

## 主要API

### 1. 音声文字起こし (`/api/transcribe`)
- **機能**: 音声ファイルの文字起こし
- **対応形式**: MP3, WAV, MP4, M4A
- **最大サイズ**: 2GB
- **言語**: 日本語（英語も対応）

### 2. Vimeo文字起こし (`/api/vimeo-transcribe`)
- **機能**: Vimeo動画の文字起こし
- **特徴**: チャンク分割、中断・再開対応
- **進捗管理**: リアルタイム進捗表示

### 3. URL検証 (`/api/validate-vimeo-url`)
- **機能**: Vimeo URLの有効性確認
- **取得情報**: タイトル、長さ、サムネイル、説明

### 4. 進捗確認 (`/api/transcription-status`)
- **機能**: 処理状況の確認
- **情報**: 進捗率、ステータス、推定完了時間

## セキュリティ・プライバシー

- **データ暗号化**: 256-bit AES暗号化
- **一時保存**: 処理完了後の自動削除
- **プライベート設定**: デフォルトでプライベート環境
- **GDPR準拠**: データ保護規制への対応

## 開発状況

### ✅ 完了済み
- [x] プロジェクト初期化・設定
- [x] Next.js + TypeScript環境構築
- [x] Google Speech-to-Text API統合
- [x] Vimeo API統合
- [x] ファイルアップロード文字起こし
- [x] Vimeo動画文字起こし
- [x] チャンク分割処理
- [x] 中断・再開機能
- [x] リアルタイム進捗表示
- [x] HTML講義録生成
- [x] 統合インターフェース
- [x] Vercelデプロイメント

### 🚧 開発中
- [ ] 講義録データベース機能
- [ ] 検索・分析機能
- [ ] ユーザー認証システム
- [ ] バッチ処理機能

### 📋 計画中
- [ ] RAGシステム統合
- [ ] 多言語対応
- [ ] 音声品質分析
- [ ] 自動要約機能

## 使用方法

### 1. Vimeo動画の文字起こし
1. ホームページから「統合インターフェースで開始」をクリック
2. 講義情報（テーマ、講演者、略歴等）を入力
3. Vimeo動画URLを入力（自動検証）
4. 文字起こし処理を開始
5. 完了後、HTML講義録をダウンロード

### 2. ファイルアップロード文字起こし
1. 「講演動画文字起こし」ページにアクセス
2. 音声・動画ファイルを選択（最大2GB）
3. 文字起こし処理を開始
4. 結果をコピーまたはダウンロード

## 環境設定

### 必要な環境変数
```bash
# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json

# Upstash Redis
KV_REST_API_URL=your-redis-url
KV_REST_API_TOKEN=your-redis-token

# Vimeo API
VIMEO_ACCESS_TOKEN=your-vimeo-token
```

### ローカル開発
```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# 型チェック
npm run type-check

# ビルド
npm run build
```

## ライセンス

このプロジェクトは公益目的で開発されています。

## 貢献

プロジェクトへの貢献を歓迎します。バグ報告や機能要望は、GitHubのIssuesでお知らせください。
