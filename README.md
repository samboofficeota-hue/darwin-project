# Darwin Project - 智の泉

公益資本主義で経済社会システムをアップデートしていくための「智の泉」

## プロジェクト概要

このプロジェクトは、公益資本主義の理念に基づいて日本や世界の経済社会システムをアップデートするための知識ベースシステムです。GenSpark AIドライブを活用したRAG（Retrieval-Augmented Generation）システムにより、講演録、文献、論文などの情報を蓄積・活用します。

## 主要機能

### 1. RAGシステム
- 講演録、メディア記事、論文のデータベース化
- GenSpark AIドライブ内での安全な情報管理
- 高度な検索・分析機能

### 2. 音声文字起こし機能
- 講演音声データの4段階テキスト化
- 原文に近い状態での完全な記録
- 自動的なRAGシステムへの保存

### 3. コンテンツ生成システム
- RAGの情報を基にした構造化されたアウトプット
- 講義録のA4 3枚図解入りまとめ
- 政策提言書や分析レポートの自動生成

## 技術スタック

- **フロントエンド**: GitHub Pages (React/Next.js)
- **バックエンド**: Google Cloud Run (Python/FastAPI)
- **AI処理・ストレージ**: GenSpark AIドライブ
- **開発環境**: Cursor IDE

## プロジェクト構造

```
darwin-project/
├── frontend/                 # フロントエンド (GitHub Pages)
├── backend/                  # バックエンド (Google Cloud Run)
├── genspark-integration/     # GenSpark統合モジュール
├── docs/                     # ドキュメント
├── data/                     # データファイル
└── scripts/                  # ユーティリティスクリプト
```

## セキュリティ

- GenSpark AIドライブの256-bit AES暗号化
- プライベートデフォルト設定
- GDPR/CCPA準拠のデータ保護

## 開発状況

- [x] プロジェクト初期化
- [x] GitHubリポジトリ設定
- [ ] GenSpark統合実装
- [ ] 音声文字起こし機能
- [ ] RAGシステム構築
- [ ] フロントエンド開発
- [ ] バックエンドAPI開発

## ライセンス

このプロジェクトは公益目的で開発されています。

## 貢献

プロジェクトへの貢献を歓迎します。詳細は[CONTRIBUTING.md](CONTRIBUTING.md)をご覧ください。