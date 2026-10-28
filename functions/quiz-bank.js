// 早押しクイズ (61.0〜) の問題。Kabocha13.github.io の testsite.html (データベース工学 第1〜6回の理解確認問題) から写したもの。
//   answer は choices の何番目が正解か (0 始まり)。答えは Cloud Functions の中だけに置き、画面には結果が出てから送る。
//   問題を足すときは testsite.html の SUBJECT_BANKS.database と同じ形で足す。

export const QUIZ_SUBJECT = 'データベース工学';

export const QUIZ_QUESTIONS = [
  {
    "id": "DB01-01",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "データベース",
      "永続性"
    ],
    "question": "Pythonの変数はプログラムが終了すると消えてしまう。これに対し、多くの情報通信システムでデータベースを使う理由となる「プログラムが終了してもデータが消えない」性質を何というか。",
    "choices": [
      "永続性",
      "揮発性",
      "冗長性",
      "可搬性"
    ],
    "answer": 0,
    "explanation": "通常のデータは揮発性で、DBを使うことでデータを永続化できます。"
  },
  {
    "id": "DB01-02",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "データベース",
      "ファイルの限界"
    ],
    "question": "データの永続化に普通のファイルを使う場合の限界として正しいものはどれか。",
    "choices": [
      "ファイルには文字列しか保存できない",
      "電源を切るとファイルの内容が消える",
      "ファイルは1つのプログラムからしか読み出せない",
      "複数のプログラムから同時に使用するとデータが壊れることがある"
    ],
    "answer": 3,
    "explanation": "読み書きプログラムの自作、性能維持の難しさ、同時使用によるデータ破損が挙げられています。"
  },
  {
    "id": "DB01-03",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "データベースシステム",
      "DBMS"
    ],
    "question": "データベースシステムの構成として正しいものはどれか。",
    "choices": [
      "SQLとER図",
      "ネットワークとハードウェア",
      "データベース（データ）とDBMS（ソフトウェア）",
      "アプリケーションとOS"
    ],
    "answer": 2,
    "explanation": "データベースシステムはデータベースとDBMSからなります。"
  },
  {
    "id": "DB01-04",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "DBMS",
      "ミドルウェア"
    ],
    "question": "DBMSは、アプリケーション（応用ソフトウェア）やOS（基本ソフトウェア）と対比して何と呼ばれるソフトウェアの一つか。",
    "choices": [
      "マルウェア",
      "ミドルウェア",
      "ファームウェア",
      "グループウェア"
    ],
    "answer": 1,
    "explanation": "DBMSはデータベースを独占的に管理するミドルウェアです。"
  },
  {
    "id": "DB01-05",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "メタデータ"
    ],
    "question": "DBシステムが管理する「メタデータ」の説明として正しいものはどれか。",
    "choices": [
      "データの意味と構造に関するデータ",
      "削除済みのデータ",
      "バックアップ用に複製されたデータ",
      "アプリケーションが一時的に使うデータ"
    ],
    "answer": 0,
    "explanation": "メタデータはデータの意味と構造に関するデータです。"
  },
  {
    "id": "DB01-06",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "データ中心アプローチ"
    ],
    "question": "データ中心アプローチ（Data Oriented Approach）の考え方として正しいものはどれか。",
    "choices": [
      "プログラムを設計してから必要に応じてデータベースを作る",
      "データベースはプログラムごとに個別に用意する",
      "データはファイルに保存しDBは使わない",
      "データベースを設計してからプログラムを設計し、DBはプログラムとは独立に管理する"
    ],
    "answer": 3,
    "explanation": "DB設計⇒プログラム設計の順で、DBはプログラムとは独立に設計・実装・運用します。"
  },
  {
    "id": "DB01-07",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "DB設計",
      "概念設計"
    ],
    "question": "DBの作り方のうち、要件の整理やER図の作成を行う工程はどれか。",
    "choices": [
      "物理設計",
      "実装",
      "概念設計",
      "論理設計"
    ],
    "answer": 2,
    "explanation": "概念設計では要件を整理しER図を作成します。"
  },
  {
    "id": "DB01-08",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "DB設計",
      "論理設計"
    ],
    "question": "スキーマ設計や正規化（論理設計の改良）を行う工程はどれか。",
    "choices": [
      "要件定義",
      "論理設計",
      "概念設計",
      "物理設計"
    ],
    "answer": 1,
    "explanation": "論理設計ではスキーマ設計と正規化を行います。"
  },
  {
    "id": "DB01-09",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "DB設計",
      "物理設計"
    ],
    "question": "データ型、性能要件、インデックス、調整などを扱う工程はどれか。",
    "choices": [
      "物理設計",
      "論理設計",
      "概念設計",
      "テスト"
    ],
    "answer": 0,
    "explanation": "物理設計ではデータ型・性能要件・インデックスなどを扱います。"
  },
  {
    "id": "DB01-10",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "データモデル"
    ],
    "question": "1980年代から現在まで主流であり、最新ではないが最重要とされるデータモデルはどれか。",
    "choices": [
      "木構造データモデル",
      "ネットワークデータモデル",
      "XMLデータモデル",
      "関係データモデル"
    ],
    "answer": 3,
    "explanation": "関係データモデルは現在も最大のシェアを誇ります。"
  },
  {
    "id": "DB01-11",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "データモデル",
      "NoSQL"
    ],
    "question": "NoSQLの「次」に登場し、関係データモデルとNoSQLのいいとこどりを狙ったものはどれか。",
    "choices": [
      "XML",
      "オブジェクト指向データモデル",
      "NewSQL",
      "SEQUEL"
    ],
    "answer": 2,
    "explanation": "NewSQLは関係データモデルとNoSQLの長所を狙ったものです。"
  },
  {
    "id": "DB01-12",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "SQL"
    ],
    "question": "SQLの起源となった言語はどれか。",
    "choices": [
      "QBE (Query By Example)",
      "SEQUEL (Structured English Query Language)",
      "COBOL",
      "Prolog"
    ],
    "answer": 1,
    "explanation": "起源がSEQUELだったため「シークエル」と読むこともあります。"
  },
  {
    "id": "DB01-13",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "関係データモデル",
      "Codd"
    ],
    "question": "関係データモデルを発明したのは誰か。",
    "choices": [
      "Edgar F. Codd",
      "Peter Chen",
      "Alan Turing",
      "Donald Knuth"
    ],
    "answer": 0,
    "explanation": "数学者だったCoddが集合論と述語論理に基づいて発明しました。"
  },
  {
    "id": "DB01-14",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "用語",
      "タプル"
    ],
    "question": "関係データモデルの用語「タプル（組）」に対応するSQLの用語はどれか。",
    "choices": [
      "列（カラム）",
      "表（テーブル）",
      "型",
      "行（レコード）"
    ],
    "answer": 3,
    "explanation": "関係＝表、属性＝列、タプル＝行に対応します。"
  },
  {
    "id": "DB01-15",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "用語",
      "属性"
    ],
    "question": "関係データモデルの用語「属性(attribute)」に対応するSQLの用語はどれか。",
    "choices": [
      "表（テーブル）",
      "スキーマ",
      "列（カラム）",
      "行（レコード）"
    ],
    "answer": 2,
    "explanation": "属性はSQLでは列（カラム）です。"
  },
  {
    "id": "DB01-16",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "用語",
      "関係"
    ],
    "question": "関係データモデルの用語「関係(relation)」に対応するSQLの用語はどれか。",
    "choices": [
      "インデックス",
      "表（テーブル）",
      "行（レコード）",
      "列（カラム）"
    ],
    "answer": 1,
    "explanation": "関係はSQLでは表（テーブル）です。"
  },
  {
    "id": "DB01-17",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "n項関係",
      "関係と表"
    ],
    "question": "n列の表がn項関係であるための条件として正しいものはどれか。",
    "choices": [
      "1列の内容はすべて同じ型で、同一内容の行が複数存在しない",
      "行数はn行でなければならない",
      "セル結合を使って同じ値をまとめる",
      "1つの列に整数と文字列が混在してもよい"
    ],
    "answer": 0,
    "explanation": "n項関係 ⊂ n列の表。同じ型・重複行なしが必要です。"
  },
  {
    "id": "DB01-18",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "n項関係",
      "重複"
    ],
    "question": "財布の中身（1000円札が3枚など）を1項関係(money)だけで表せない理由はどれか。",
    "choices": [
      "1項関係には整数を入れられないから",
      "1項関係は主キーを持てないから",
      "1項関係は表で表現できないから",
      "関係は集合論に基づくため同じタプルを複数持てないから"
    ],
    "answer": 3,
    "explanation": "重複できないので、金種と枚数の2項関係が必要です。"
  },
  {
    "id": "DB01-19",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "定義域",
      "直積"
    ],
    "question": "n項の関係(relation)の形式的定義として正しいものはどれか。",
    "choices": [
      "n個の属性の共通集合",
      "n個のタプルの直積",
      "n個の定義域の直積の部分集合",
      "n個の定義域の和集合"
    ],
    "answer": 2,
    "explanation": "関係はn個の定義域の直積の部分集合で、nを次数と呼びます。"
  },
  {
    "id": "DB01-20",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "定義域",
      "直積"
    ],
    "question": "要素数4の定義域d_personと要素数3の定義域d_bookの直積 d_person × d_book の要素数はいくつか。",
    "choices": [
      "3",
      "12",
      "7",
      "4"
    ],
    "answer": 1,
    "explanation": "直積はすべての組み合わせなので4×3=12です。"
  },
  {
    "id": "DB01-21",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "定義域",
      "直積"
    ],
    "question": "定義域 d_person（要素数4）と d_book（要素数3）からなる関係 R_write のタプル数としてありうる範囲はどれか。",
    "choices": [
      "0以上12以下",
      "1以上12以下",
      "3以上4以下",
      "ちょうど12"
    ],
    "answer": 0,
    "explanation": "関係は直積の部分集合なので0〜12タプルです。"
  },
  {
    "id": "DB01-22",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "属性",
      "定義域"
    ],
    "question": "属性(attribute)の説明として正しいものはどれか。",
    "choices": [
      "定義域に含まれる値の個数",
      "タプルを一意に識別する値",
      "関係の行数",
      "関係における定義域の役割(role)に対して付けられる名前"
    ],
    "answer": 3,
    "explanation": "本人の社員番号と上司の社員番号は同じ定義域でも役割が異なる別の属性です。"
  },
  {
    "id": "DB01-23",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "スキーマ",
      "インスタンス"
    ],
    "question": "ある時点におけるタプルの集合を何というか。",
    "choices": [
      "定義域",
      "次数",
      "関係のインスタンス",
      "関係のスキーマ"
    ],
    "answer": 2,
    "explanation": "スキーマは関係名(属性名…)、インスタンスはある時点のタプル集合です。"
  },
  {
    "id": "DB01-24",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "スキーマ"
    ],
    "question": "「関係名(属性名1, 属性名2, …, 属性名n)」を何と呼ぶか。",
    "choices": [
      "定義域",
      "関係のスキーマ",
      "関係のインスタンス",
      "タプル"
    ],
    "answer": 1,
    "explanation": "これを関係スキーマと呼びます。"
  },
  {
    "id": "DB01-25",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "主キー"
    ],
    "question": "社員の関係で、属性name（氏名）が主キーに不適である理由として最も適切なものはどれか。",
    "choices": [
      "同姓同名がありうるので一意になるとは限らないから",
      "文字列型は主キーにできないから",
      "名前は変更されないから",
      "名前は外部キーだから"
    ],
    "answer": 0,
    "explanation": "一意になるとは限らない属性は主キーに不適です。"
  },
  {
    "id": "DB01-26",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "主キー",
      "複合キー"
    ],
    "question": "健康診断(社員番号, 受検年, 身長, 体重)で「社員は年に1回だけ受検する」とき、主キーはどれか。",
    "choices": [
      "{社員番号}",
      "{受検年}",
      "{身長, 体重}",
      "{社員番号, 受検年}"
    ],
    "answer": 3,
    "explanation": "社員番号だけでは一意にならないので組み合わせの複合キーにします。"
  },
  {
    "id": "DB01-27",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "外部キー"
    ],
    "question": "外部キー(foreign key)の説明として正しいものはどれか。",
    "choices": [
      "どの関係からも参照されない属性",
      "NULLを禁止した候補キー",
      "他の関係のタプルを参照する目的で、参照される側の主キーの値を持つ属性",
      "関係内でタプルを一意に識別する属性"
    ],
    "answer": 2,
    "explanation": "参照する側の属性が外部キーです。"
  },
  {
    "id": "DB01-28",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "主キー"
    ],
    "question": "財布の中身を表す関係 wallet(money, num)（money は金種、num はその枚数。同じ金種は1行にまとめる）の主キーはどれか。",
    "choices": [
      "主キーは存在しない",
      "money",
      "num",
      "{money, num}"
    ],
    "answer": 1,
    "explanation": "金種ごとに1行なので金種moneyで一意に識別できます。"
  },
  {
    "id": "DB01-29",
    "lecture": "第1回 データベースと関係データモデル",
    "tags": [
      "用語"
    ],
    "question": "現場（実務）で特によく使われる用語の組み合わせはどれか。",
    "choices": [
      "テーブル、カラム、レコード",
      "関係、属性、タプル",
      "リレーション、ドメイン、タプル",
      "表、列、行のみ"
    ],
    "answer": 0,
    "explanation": "現場ではSQLの用語、特にテーブル・カラム・レコードをよく聞きます。"
  },
  {
    "id": "DB02-01",
    "lecture": "第2回 SQL",
    "tags": [
      "SQL"
    ],
    "question": "ISOにおけるSQLの位置づけとして正しいものはどれか。",
    "choices": [
      "Sequential Query Languageの略",
      "何かの略語ではない単なるSQL",
      "Structured Query Languageの正式略称",
      "Standard Query Languageの略"
    ],
    "answer": 1,
    "explanation": "元はStructured Query Languageの頭文字ですが、ISOでは単なるSQLです。"
  },
  {
    "id": "DB02-02",
    "lecture": "第2回 SQL",
    "tags": [
      "SQL",
      "標準化"
    ],
    "question": "SQLの標準化について正しいものはどれか。",
    "choices": [
      "ISOで標準化されているが、対応状況はベンダによってバラバラ",
      "すべてのRDBMSが標準SQLに完全準拠している",
      "一度制定されてから仕様は変わっていない",
      "関係データモデルを厳密に実装している"
    ],
    "answer": 0,
    "explanation": "RDBMSによって独自仕様や非準拠があります。"
  },
  {
    "id": "DB02-03",
    "lecture": "第2回 SQL",
    "tags": [
      "DDL"
    ],
    "question": "データ定義言語(DDL)に分類されるものはどれか。",
    "choices": [
      "SELECT文",
      "INSERT文",
      "DELETE文",
      "CREATE TABLE文"
    ],
    "answer": 3,
    "explanation": "DDLはCREATE TABLE/VIEW/INDEXなど、DMLはSELECT/INSERT/DELETEなどです。"
  },
  {
    "id": "DB02-04",
    "lecture": "第2回 SQL",
    "tags": [
      "DML"
    ],
    "question": "データ操作言語(DML)に分類されるものはどれか。",
    "choices": [
      "CREATE VIEW文",
      "CREATE INDEX文",
      "INSERT文",
      "CREATE TABLE文"
    ],
    "answer": 2,
    "explanation": "INSERT文はレコードを挿入するDMLです。"
  },
  {
    "id": "DB02-05",
    "lecture": "第2回 SQL",
    "tags": [
      "文字列"
    ],
    "question": "文字列 Let's go. をSQLの文字列定数として正しく書いたものはどれか。",
    "choices": [
      "'Let's go.'",
      "'Let''s go.'",
      "'Let\\'s go.'",
      "\"Let's go.\""
    ],
    "answer": 1,
    "explanation": "シングルクォートを2個連続で書くと1つ分になります。"
  },
  {
    "id": "DB02-06",
    "lecture": "第2回 SQL",
    "tags": [
      "演算子"
    ],
    "question": "標準SQLの文字列結合演算子はどれか。",
    "choices": [
      "||",
      "+",
      "&",
      "."
    ],
    "answer": 0,
    "explanation": "縦棒2つ「||」です（MySQLはデフォルトでは異なる）。"
  },
  {
    "id": "DB02-07",
    "lecture": "第2回 SQL",
    "tags": [
      "演算子",
      "整数"
    ],
    "question": "SQLで 10/3 を計算した結果はどれか。",
    "choices": [
      "3.3333…",
      "4",
      "エラー",
      "3"
    ],
    "answer": 3,
    "explanation": "整数同士なので結果も整数の3。10./3なら3.333…です。"
  },
  {
    "id": "DB02-08",
    "lecture": "第2回 SQL",
    "tags": [
      "コメント"
    ],
    "question": "SQLの1行コメントの記法はどれか。",
    "choices": [
      "# （シャープ）",
      "' （シングルクォート）",
      "-- （ハイフン2つ）",
      "// （スラッシュ2つ）"
    ],
    "answer": 2,
    "explanation": "ハイフン2つから行末までがコメント。複数行は /* */ です。"
  },
  {
    "id": "DB02-09",
    "lecture": "第2回 SQL",
    "tags": [
      "SELECT",
      "エイリアス"
    ],
    "question": "「FROM employees e」のようにエイリアスを定義した場合の注意点として正しいものはどれか。",
    "choices": [
      "エイリアスはテーブルを永久に改名する",
      "そのSELECT文の中では必ずエイリアスの方を使い、元のテーブル名は使わない",
      "エイリアスと元のテーブル名を自由に混在してよい",
      "エイリアスはWHERE句でのみ使える"
    ],
    "answer": 1,
    "explanation": "aliasを定義したらそのSELECT文の中ではaliasを使います。"
  },
  {
    "id": "DB02-10",
    "lecture": "第2回 SQL",
    "tags": [
      "like"
    ],
    "question": "SELECT * FROM employees WHERE name like '%田%'; が検索するものはどれか。",
    "choices": [
      "名前に「田」が含まれる社員",
      "名前が「田」で始まる社員",
      "名前が「田」で終わる社員",
      "名前が「田」1文字の社員"
    ],
    "answer": 0,
    "explanation": "%は任意の文字列を表すワイルドカードです。"
  },
  {
    "id": "DB02-11",
    "lecture": "第2回 SQL",
    "tags": [
      "like"
    ],
    "question": "like述語で「英数字1文字」を表すワイルドカードはどれか。",
    "choices": [
      "%",
      "*",
      "?",
      "_"
    ],
    "answer": 3,
    "explanation": "%は任意の文字列、_は1文字です。"
  },
  {
    "id": "DB02-12",
    "lecture": "第2回 SQL",
    "tags": [
      "DISTINCT"
    ],
    "question": "SELECT DISTINCT store_id, floor FROM departments; のDISTINCTの働きはどれか。",
    "choices": [
      "NULLを除外する",
      "主キーのみを出力する",
      "重複したレコードを出力しない",
      "出力を昇順に並べる"
    ],
    "answer": 2,
    "explanation": "結果は20行から11行（総フロア数）に減ります。"
  },
  {
    "id": "DB02-13",
    "lecture": "第2回 SQL",
    "tags": [
      "DISTINCT",
      "関係データモデル"
    ],
    "question": "現実のRDBMSがデフォルトで重複を除去しない（関係データモデルと矛盾した出力をする）理由はどれか。",
    "choices": [
      "重複は起こりえないため",
      "重複を取り除く処理の負荷が大きいため",
      "重複除去は標準SQLで禁止されているため",
      "主キーが必ず出力されるため"
    ],
    "answer": 1,
    "explanation": "原則に従うにはDISTINCTを付けます。"
  },
  {
    "id": "DB02-14",
    "lecture": "第2回 SQL",
    "tags": [
      "集合演算",
      "EXCEPT"
    ],
    "question": "「… WHERE 条件A EXCEPT … WHERE 条件B」（同じテーブル）と同じ結果になる書き方はどれか。",
    "choices": [
      "WHERE 条件A AND NOT (条件B)",
      "WHERE 条件A OR 条件B",
      "WHERE 条件A AND 条件B",
      "WHERE NOT (条件A) AND 条件B"
    ],
    "answer": 0,
    "explanation": "EXCEPTは差集合です。"
  },
  {
    "id": "DB02-15",
    "lecture": "第2回 SQL",
    "tags": [
      "集合演算",
      "INTERSECT"
    ],
    "question": "同じテーブルに対する UNION / INTERSECT と同じ結果になる論理演算子の組み合わせはどれか。",
    "choices": [
      "UNION＝AND、INTERSECT＝OR",
      "UNION＝NOT、INTERSECT＝OR",
      "どちらもAND",
      "UNION＝OR、INTERSECT＝AND"
    ],
    "answer": 3,
    "explanation": "合併集合はOR、共通集合はANDに対応します。"
  },
  {
    "id": "DB02-16",
    "lecture": "第2回 SQL",
    "tags": [
      "直積",
      "CROSS JOIN"
    ],
    "question": "テーブルr, s, tの行数がそれぞれ10行、50行、30行のとき、SELECT * FROM r CROSS JOIN s CROSS JOIN t; の出力行数はどれか。",
    "choices": [
      "500行",
      "1500行",
      "15000行",
      "90行"
    ],
    "answer": 2,
    "explanation": "直積の行数は各テーブルの行数の積です。"
  },
  {
    "id": "DB02-17",
    "lecture": "第2回 SQL",
    "tags": [
      "直積",
      "CROSS JOIN"
    ],
    "question": "departments（20行）と stores（3行）の SELECT * FROM departments CROSS JOIN stores; の行数はどれか。",
    "choices": [
      "3行",
      "60行",
      "23行",
      "20行"
    ],
    "answer": 1,
    "explanation": "20×3=60行です。"
  },
  {
    "id": "DB02-18",
    "lecture": "第2回 SQL",
    "tags": [
      "結合"
    ],
    "question": "FROM句にカンマで複数テーブルを並べWHERE句に結合条件を書く古い書き方の問題点はどれか。",
    "choices": [
      "一旦直積を求めてから絞るため処理時間やメモリを多く使い、WHERE句を忘れると大量の行が出力される",
      "外部キーが使えない",
      "SELECT句にカラム名を書けない",
      "結果が必ず空になる"
    ],
    "answer": 0,
    "explanation": "現場ではJOIN … ON …を使います。"
  },
  {
    "id": "DB02-19",
    "lecture": "第2回 SQL",
    "tags": [
      "結合",
      "結合条件"
    ],
    "question": "departments(id, name, store_id, floor, manager_id)（manager_id はその売場を担当するマネージャの社員番号） と employees(id, name, salary, manager_id, birth_year, start_year)（manager_id は上司の社員番号） で、FROM departments d JOIN employees e ON d.manager_id = e.manager_id の結果が表すものはどれか。",
    "choices": [
      "各売場のマネージャ本人",
      "マネージャのいない売場",
      "すべての売場と社員の組み合わせ",
      "各売場のマネージャを上司に持つ社員（売場を担当する全社員）"
    ],
    "answer": 3,
    "explanation": "ON d.manager_id=e.id ならマネージャ本人になります。"
  },
  {
    "id": "DB02-20",
    "lecture": "第2回 SQL",
    "tags": [
      "自己結合"
    ],
    "question": "社員と上司のように同じテーブルの別々のレコードを扱う自己結合の書き方のポイントはどれか。",
    "choices": [
      "CROSS JOINのみを使う",
      "UNIONでつなげる",
      "同じテーブルを複数回書き、エイリアスで区別する",
      "テーブルを複製してから結合する"
    ],
    "answer": 2,
    "explanation": "aliasが違うと同じ内容のテーブルが複数あるかのように動作します。"
  },
  {
    "id": "DB02-21",
    "lecture": "第2回 SQL",
    "tags": [
      "型",
      "SQLite3"
    ],
    "question": "SQLite3の型システムの特徴として正しいものはどれか。",
    "choices": [
      "他の多くのRDBMSより型チェックが厳しい",
      "カラムに異なる型のデータを挿入してもエラーにならず受け入れられる",
      "VARCHAR(n)の最大文字数nが厳密に守られる",
      "BOOLEAN型が独立した型として存在する"
    ],
    "answer": 1,
    "explanation": "SQLite3は型が「緩い」のが特徴です。"
  },
  {
    "id": "DB02-22",
    "lecture": "第2回 SQL",
    "tags": [
      "型",
      "SQLite3"
    ],
    "question": "SQLite3でBOOLEAN（真偽値型）を指定した場合の扱いはどれか。",
    "choices": [
      "INTEGERとして扱われ、0が偽、1が真",
      "TEXTとして扱われ 'true'/'false'",
      "REALとして扱われる",
      "エラーになる"
    ],
    "answer": 0,
    "explanation": "BOOLEANはINTEGERとして扱われます。"
  },
  {
    "id": "DB02-23",
    "lecture": "第2回 SQL",
    "tags": [
      "型",
      "定義域"
    ],
    "question": "SQLの「型」は関係データモデルの何に相当するか。",
    "choices": [
      "タプル",
      "主キー",
      "スキーマ",
      "定義域"
    ],
    "answer": 3,
    "explanation": "型は定義域に相当します。"
  },
  {
    "id": "DB02-24",
    "lecture": "第2回 SQL",
    "tags": [
      "命名規則"
    ],
    "question": "命名規則の例として、社員を格納するテーブルの名前に適切なものはどれか。",
    "choices": [
      "EMP",
      "shain",
      "employees",
      "employee"
    ],
    "answer": 2,
    "explanation": "テーブル名は格納される実体を表す名詞の複数形にします。"
  },
  {
    "id": "DB02-25",
    "lecture": "第2回 SQL",
    "tags": [
      "命名規則",
      "外部キー"
    ],
    "question": "テーブルstoresの主キーを参照するdepartmentsの外部キーのカラム名として、命名規則の例に沿うものはどれか。",
    "choices": [
      "StoreID",
      "store_id",
      "stores",
      "id_store"
    ],
    "answer": 1,
    "explanation": "参照先テーブル名の単数形と「id」をアンダースコアでつなげます。"
  },
  {
    "id": "DB02-26",
    "lecture": "第2回 SQL",
    "tags": [
      "命名規則"
    ],
    "question": "命名規則の例で「delete_flag」の代わりに推奨されるカラム名はどれか。",
    "choices": [
      "is_deleted",
      "del_flg",
      "deleted_flag",
      "flag"
    ],
    "answer": 0,
    "explanation": "flagは真偽の意味が不明になりがちなので「is_受動態」を使います。"
  },
  {
    "id": "DB02-27",
    "lecture": "第2回 SQL",
    "tags": [
      "命名規則"
    ],
    "question": "命名規則の例で、日時を表すカラム名として適切なものはどれか。",
    "choices": [
      "created_on",
      "create_date",
      "CreatedAt",
      "created_at"
    ],
    "answer": 3,
    "explanation": "日付は「受動態_on」、日時は「受動態_at」にします。"
  },
  {
    "id": "DB02-28",
    "lecture": "第2回 SQL",
    "tags": [
      "命名規則"
    ],
    "question": "テーブル名・カラム名の命名規則の例として正しいものはどれか。",
    "choices": [
      "大文字と小文字を混在させる",
      "codeをcdのように略して短くする",
      "英語の小文字を使い、複数単語はスネークケースでつなぎ、単語は略さない",
      "日本語やローマ字を積極的に使う"
    ],
    "answer": 2,
    "explanation": "RDBMS間の違いを避けるため小文字・英語・スネークケースにします。"
  },
  {
    "id": "DB02-29",
    "lecture": "第2回 SQL",
    "tags": [
      "多対多",
      "命名規則"
    ],
    "question": "employeesとdepartmentsが多対多の関連のとき、中間テーブル名として命名規則の例に沿うものはどれか。",
    "choices": [
      "relations",
      "employees_departments",
      "employee_department_table",
      "emp_dep"
    ],
    "answer": 1,
    "explanation": "それぞれのテーブル名（複数形）をアンダースコアでつなげます。"
  },
  {
    "id": "DB02-30",
    "lecture": "第2回 SQL",
    "tags": [
      "INSERT",
      "NULL"
    ],
    "question": "INSERT INTO stores (id, address) VALUES (10, '大阪府大阪市'); を実行したとき、店舗名nameの値はどうなるか。",
    "choices": [
      "NULL（空値）",
      "空文字列 ''",
      "0",
      "エラーになる"
    ],
    "answer": 0,
    "explanation": "値を指定しなかったカラムはNULLになります。"
  },
  {
    "id": "DB02-31",
    "lecture": "第2回 SQL",
    "tags": [
      "DELETE"
    ],
    "question": "DELETE FROM employees; のようにWHERE句を書き忘れて実行するとどうなるか。",
    "choices": [
      "何も削除されない",
      "テーブルごと削除される",
      "エラーになる",
      "全レコードが削除される"
    ],
    "answer": 3,
    "explanation": "1レコードだけ削除したいなら主キーを指定します。"
  },
  {
    "id": "DB02-32",
    "lecture": "第2回 SQL",
    "tags": [
      "DROP"
    ],
    "question": "テーブルそのものを削除するSQL文はどれか。",
    "choices": [
      "REMOVE TABLE テーブル名;",
      "UPDATE テーブル名 SET NULL;",
      "DROP TABLE テーブル名;",
      "DELETE FROM テーブル名;"
    ],
    "answer": 2,
    "explanation": "DELETEはレコード削除、DROP TABLEはテーブル削除です。"
  },
  {
    "id": "DB02-33",
    "lecture": "第2回 SQL",
    "tags": [
      "UPDATE"
    ],
    "question": "UPDATE employees SET salary=salary+1000 WHERE id=35; の動作はどれか。",
    "choices": [
      "idが35の社員を削除する",
      "idが35の社員の給料を1000増やす",
      "全社員の給料を1000にする",
      "idが35の社員の給料を1000にする"
    ],
    "answer": 1,
    "explanation": "SET カラム名=式 で値を変更します。"
  },
  {
    "id": "DB02-34",
    "lecture": "第2回 SQL",
    "tags": [
      "論理削除"
    ],
    "question": "「論理削除」の説明として正しいものはどれか。",
    "choices": [
      "is_deletedなどのフラグを書き換えることで削除したことにする",
      "DELETEで実際にレコードを削除する",
      "DROP TABLEでテーブルを削除する",
      "バックアップから復元する"
    ],
    "answer": 0,
    "explanation": "DELETEで実際に削除するのは物理削除です。"
  },
  {
    "id": "DB02-35",
    "lecture": "第2回 SQL",
    "tags": [
      "INSERT",
      "SELECT"
    ],
    "question": "INSERT INTO young_employees SELECT * FROM employees WHERE birth_year > 2000; の動作はどれか。",
    "choices": [
      "young_employeesテーブルを作成する",
      "employeesから若い社員を削除する",
      "2000年以前の社員を挿入する",
      "2000年より後に生まれた社員を検索してyoung_employeesに挿入する"
    ],
    "answer": 3,
    "explanation": "SELECTの検索結果を他のテーブルに挿入できます。"
  },
  {
    "id": "DB02-36",
    "lecture": "第2回 SQL",
    "tags": [
      "SQLite3"
    ],
    "question": "SQLite3の特徴として正しいものはどれか。",
    "choices": [
      "複数ファイルに分散してデータを保存する",
      "有償の商用製品である",
      "サーバレスで、1つのデータベースが1つのファイルになる",
      "クライアント・サーバ型で本格運用に向く"
    ],
    "answer": 2,
    "explanation": "ライブラリとしてアプリに直接組み込むサーバレス・ファイルベースのRDBMSです。"
  },
  {
    "id": "DB02-37",
    "lecture": "第2回 SQL",
    "tags": [
      "SQLite3",
      "ドットコマンド"
    ],
    "question": "SQLite3で、SQL文を記述したファイルを読み込んで実行するドットコマンドはどれか。",
    "choices": [
      ".dump ファイル名",
      ".read ファイル名",
      ".output ファイル名",
      ".schema ファイル名"
    ],
    "answer": 1,
    "explanation": ".readで間接実行します。"
  },
  {
    "id": "DB02-38",
    "lecture": "第2回 SQL",
    "tags": [
      "SQLite3",
      "ドットコマンド"
    ],
    "question": "SQLite3でデータベースに格納されたテーブル一覧を表示するドットコマンドはどれか。",
    "choices": [
      ".tables",
      ".schema",
      ".headers on",
      ".mode column"
    ],
    "answer": 0,
    "explanation": ".schema テーブル名 はスキーマを表示します。"
  },
  {
    "id": "DB02-39",
    "lecture": "第2回 SQL",
    "tags": [
      "SQLite3",
      "ドットコマンド"
    ],
    "question": "ドットコマンドの書き方として正しいものはどれか。",
    "choices": [
      "文末に必ず「;」を付ける",
      "複数行に分けて書ける",
      "SELECT文の中に埋め込んで使う",
      "ピリオドで始め1行で書き、文末の「;」は不要"
    ],
    "answer": 3,
    "explanation": "ドットコマンドはSQL文ではありません。"
  },
  {
    "id": "DB02-40",
    "lecture": "第2回 SQL",
    "tags": [
      "SELECT",
      "演習"
    ],
    "question": "products(id, name, inventory, unit_price, origin) に 部品A 100円、部品B 500円、部品C 300円、半製品D 2000円、製品E 3500円、製品F 4900円 がある。SELECT name, unit_price FROM products WHERE unit_price > 1000; の結果の行数はどれか。",
    "choices": [
      "4行",
      "6行",
      "3行",
      "2行"
    ],
    "answer": 2,
    "explanation": "半製品D・製品E・製品Fの3行です。"
  },
  {
    "id": "DB02-41",
    "lecture": "第2回 SQL",
    "tags": [
      "結合",
      "演習"
    ],
    "question": "cities(name, population, prefecture) に（名古屋市, 229.6, 愛知県）（八王子市, 57.8, 東京都）（横浜市, 372.5, 神奈川県）（千葉市, 97.2, 千葉県）（船橋市, 62.3, 千葉県）（川崎市, 147.5, 神奈川県）がある。products の部品C は在庫数 30・生産地（origin）名古屋市である。SELECT p.inventory, c.prefecture FROM cities c JOIN products p ON c.name = p.origin; で部品C の行に出力される prefecture はどれか。",
    "choices": [
      "東京都",
      "愛知県",
      "神奈川県",
      "千葉県"
    ],
    "answer": 1,
    "explanation": "名古屋市の都道府県は愛知県です。"
  },
  {
    "id": "DB03-01",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "設計原則",
      "非冗長性"
    ],
    "question": "データベース設計の原則のうち「同じ情報を2ヶ所以上に記録しない」はどれか。",
    "choices": [
      "統合性",
      "分離性",
      "非冗長性",
      "充足性"
    ],
    "answer": 2,
    "explanation": "充足性・非冗長性・統合性・分離性の4原則があります。"
  },
  {
    "id": "DB03-02",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "設計原則",
      "統合性"
    ],
    "question": "データベース設計の原則のうち「関連する情報はまとめて記録」はどれか。",
    "choices": [
      "充足性",
      "統合性",
      "分離性",
      "非冗長性"
    ],
    "answer": 1,
    "explanation": "関連する情報はまとめるのが統合性です。"
  },
  {
    "id": "DB03-03",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "設計原則",
      "分離性"
    ],
    "question": "データベース設計の原則のうち「独立な情報は別々に記録」はどれか。",
    "choices": [
      "分離性",
      "統合性",
      "充足性",
      "非冗長性"
    ],
    "answer": 0,
    "explanation": "例：科目と教員を分離する。"
  },
  {
    "id": "DB03-04",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "設計原則",
      "充足性"
    ],
    "question": "データベース設計の原則のうち「必要な情報（部品）をすべて揃える」はどれか。",
    "choices": [
      "非冗長性",
      "分離性",
      "統合性",
      "充足性"
    ],
    "answer": 3,
    "explanation": "DBは情報の「部品倉庫」です。"
  },
  {
    "id": "DB03-05",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "非冗長性",
      "オーソリティ"
    ],
    "question": "非冗長性の原則（同じ情報を2ヶ所以上に記録しない）の目的として最も適切なものはどれか。",
    "choices": [
      "検索を高速化すること",
      "テーブル数を減らすこと",
      "情報源のオーソリティを明確にすること",
      "記憶容量を節約すること"
    ],
    "answer": 2,
    "explanation": "記憶容量の節約は目的ではありません。"
  },
  {
    "id": "DB03-06",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "設計原則"
    ],
    "question": "科目(科目番号, 科目名, 担当, 単位数) の表で、担当に同じ教員名が何度も出てきて、教員の住所など氏名以外の情報はどこにもない。設計の4原則（非冗長性・統合性・分離性・充足性）のうち、不備がある原則の組み合わせはどれか。",
    "choices": [
      "主キーの不備のみ",
      "非冗長性・統合性・分離性の不備",
      "充足性のみの不備",
      "不備はない"
    ],
    "answer": 1,
    "explanation": "教員テーブルを分離し、教員情報を統合して非冗長化します。"
  },
  {
    "id": "DB03-07",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ゴルフDB",
      "オーソリティ"
    ],
    "question": "ゴルフ成績DBでGROSS（IN+OUT）を記録しない理由はどれか。",
    "choices": [
      "INとOUTから計算でき、オーソリティではないから",
      "GROSSは個人情報だから",
      "GROSSは毎回変わるから",
      "GROSSは文字列だから"
    ],
    "answer": 0,
    "explanation": "表示時にIN+OUTをGROSSとして表示します。NETも同様です。"
  },
  {
    "id": "DB03-08",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ゴルフDB",
      "業界知識"
    ],
    "question": "ゴルフ同好会の成績DBで、メンバのHDCP（ハンディキャップ）は人にひもづく数字だが、コンペごとに調整されて異なる数字になることがある。このときの設計として適切なものはどれか。",
    "choices": [
      "メンバ個人のHDCPとは別に、各コンペの成績にもそのコンペで使ったHDCPを記録する",
      "HDCPはメンバのテーブルにだけ記録する",
      "HDCPはINとOUTから計算できるので記録しない",
      "コンペごとにメンバのテーブルを作り直す"
    ],
    "answer": 0,
    "explanation": "メンバ個人のHDCPはメンバの情報、コンペで使ったHDCPは各コンペ参加メンバの情報として別々に記録します。"
  },
  {
    "id": "DB03-09",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ゴルフDB",
      "悪い設計"
    ],
    "question": "コンペ1回の結果を1つのテーブル（heiseikai43, heiseikai44, …）にする設計が悪い理由として適切なものはどれか。",
    "choices": [
      "主キーが複合キーになる",
      "表計算でも使えない",
      "同じ氏名が何度も現れて冗長で、個人の成績履歴を得にくい",
      "テーブル数が少なすぎる"
    ],
    "answer": 2,
    "explanation": "表計算ならよいがDBではダメな設計です。"
  },
  {
    "id": "DB03-10",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "SQL",
      "AS"
    ],
    "question": "SELECT s.in+s.out AS gross … の「AS」の働きはどれか。",
    "choices": [
      "重複を除去する",
      "計算結果を出力するカラムに別名を付与する",
      "テーブルを結合する",
      "出力をソートする"
    ],
    "answer": 1,
    "explanation": "ASで別名を付けます。"
  },
  {
    "id": "DB03-11",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "SQL",
      "ORDER BY"
    ],
    "question": "ORDER BY句の働きはどれか。",
    "choices": [
      "出力をソートする",
      "グループ化する",
      "重複を除去する",
      "条件で絞り込む"
    ],
    "answer": 0,
    "explanation": "例：ORDER BY c.id でコンペ回数順に出力。"
  },
  {
    "id": "DB03-12",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ER図"
    ],
    "question": "ER図（実体関連図）で対象世界を整理する3つの概念はどれか。",
    "choices": [
      "関係・タプル・定義域",
      "表・行・列",
      "選択・射影・結合",
      "実体・関連・属性"
    ],
    "answer": 3,
    "explanation": "entity・relationship・attributeです。"
  },
  {
    "id": "DB03-13",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ER図",
      "実体"
    ],
    "question": "実体(entity)を見分けるポイントとして適切なものはどれか。",
    "choices": [
      "他の実体の属性である",
      "1つしか存在しない",
      "ひとつ、ふたつと数えられる、それぞれに名前がある",
      "必ず数値で表される"
    ],
    "answer": 2,
    "explanation": "記録対象となる独立性の高い「もの」や「こと」です。"
  },
  {
    "id": "DB03-14",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ER図",
      "関連"
    ],
    "question": "CDジャケットDBで「1枚のCDには複数のトラックがあり、1つのトラックは唯一のCDに所属する」。CDとトラックの関連はどれか。",
    "choices": [
      "多対1（CD側が多）",
      "1対多",
      "多対多",
      "1対1"
    ],
    "answer": 1,
    "explanation": "関連 in はCD（1）からトラック（多）です。"
  },
  {
    "id": "DB03-15",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ER図",
      "多対多"
    ],
    "question": "トラックとアーティストの関連「play（演奏）」の種類はどれか。",
    "choices": [
      "多対多",
      "1対多",
      "多対1",
      "1対1"
    ],
    "answer": 0,
    "explanation": "1トラックに複数アーティスト、1アーティストが複数トラックに参加します。"
  },
  {
    "id": "DB03-16",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ER図",
      "関連"
    ],
    "question": "トラックと曲(music)の関連「of」の種類はどれか。",
    "choices": [
      "1対1",
      "1対多",
      "多対多",
      "多対1"
    ],
    "answer": 3,
    "explanation": "1トラックに1曲、同じ曲が複数CDに収録されうるので多対1です。"
  },
  {
    "id": "DB03-17",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ER図",
      "関連"
    ],
    "question": "作曲(compose)・作詞(lyric)の関連が、trackではなくmusicとアーティストの間に置かれる理由はどれか。",
    "choices": [
      "trackには主キーがないから",
      "演奏者と同じだから",
      "作曲者・作詞者は演奏ではなく曲に関するものだから",
      "musicの方が行数が少ないから"
    ],
    "answer": 2,
    "explanation": "演奏者(play)は同じ曲でも演奏ごとに違うのでtrackとの関連です。"
  },
  {
    "id": "DB03-18",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ER図",
      "記法"
    ],
    "question": "この科目で使うER図（Chen記法ベース）で、関連の矢印の付け方として正しいものはどれか。",
    "choices": [
      "矢印は使わずNや1の文字で書く",
      "多の方に矢印あり、1の方は矢印なし",
      "1の方に矢印あり、多の方は矢印なし",
      "多対多は矢印なし"
    ],
    "answer": 1,
    "explanation": "Chen記法ベースで、多対多は両方とも矢印にします。"
  },
  {
    "id": "DB03-19",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "多"
    ],
    "question": "ER図の「多」の正しい意味はどれか。",
    "choices": [
      "0を含む不定個数",
      "2以上",
      "1以上",
      "3以上"
    ],
    "answer": 0,
    "explanation": "扶養家族の平均が0.3人でも「多」と考えます。"
  },
  {
    "id": "DB03-20",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "論理設計",
      "手順"
    ],
    "question": "論理設計の手順として正しい順番はどれか。",
    "choices": [
      "外部キーの設定→テーブルの作成→主キーの設定→中間テーブルの作成",
      "中間テーブルの作成→テーブルの作成→外部キーの設定→主キーの設定",
      "カラムの設定→外部キーの設定→テーブルの作成→中間テーブルの作成",
      "テーブルの作成→中間テーブルの作成→カラムと主キーの設定→外部キーの設定"
    ],
    "answer": 3,
    "explanation": "ER図の実体→多対多関連→カラム・主キー→外部キーの順です。"
  },
  {
    "id": "DB03-21",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "論理設計",
      "中間テーブル"
    ],
    "question": "ER図で多対多の関連（両側矢印のひし形）に対応して作成するものはどれか。",
    "choices": [
      "インデックス",
      "ビュー",
      "中間テーブル",
      "外部キーのみ"
    ],
    "answer": 2,
    "explanation": "例：student と course の間の take テーブル。"
  },
  {
    "id": "DB03-22",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "論理設計",
      "中間テーブル"
    ],
    "question": "中間テーブル take(student_id, course_id, grade) の主キーの決め方として適切なものはどれか（student_id・course_id はそれぞれ学生・科目のテーブルの主キーを参照する）。",
    "choices": [
      "主キーは設定しない",
      "参照先テーブルの主キーを組み合わせたもの {student_id, course_id}",
      "grade単独",
      "student_id単独"
    ],
    "answer": 1,
    "explanation": "人工キーを使う方法もありますがデメリットも多いです。"
  },
  {
    "id": "DB03-23",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "論理設計",
      "外部キー"
    ],
    "question": "ER図の多対1関連（片側矢印のひし形）で、外部キーを設定する場所はどれか。",
    "choices": [
      "多側（矢印側）のテーブルに、1側テーブルの主キーを参照する外部キーを置く",
      "1側のテーブルに、多側の主キーを参照する外部キーを置く",
      "中間テーブルを必ず作る",
      "両方のテーブルに外部キーを置く"
    ],
    "answer": 0,
    "explanation": "例：courses.professor_id が professors.id を参照。"
  },
  {
    "id": "DB03-24",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "自然キー",
      "人工キー"
    ],
    "question": "自然キー（ナチュラルキー）の例として適切なものはどれか。",
    "choices": [
      "AUTOINCREMENTで採番した連番",
      "レコードの挿入順序",
      "ランダムに生成した値",
      "学籍番号"
    ],
    "answer": 3,
    "explanation": "もともと存在する主キーとすべきカラムが自然キーです。CDの規格品番も自然キーです。"
  },
  {
    "id": "DB03-25",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "人工キー",
      "SQLite3"
    ],
    "question": "SQLite3で自動採番される整数型の人工キーを作る指定はどれか。",
    "choices": [
      "INTEGER AUTO_INCREMENT",
      "INTEGER IDENTITY",
      "INTEGER PRIMARY KEY AUTOINCREMENT",
      "INTEGER SERIAL"
    ],
    "answer": 2,
    "explanation": "MySQLはAUTO_INCREMENT、PostgreSQLはSERIALです。"
  },
  {
    "id": "DB03-26",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "エンティティ化"
    ],
    "question": "多対多の関連が、キー以外の属性（カラム）をいくつも持つ場合のモデル化の考え方として適切なものはどれか。",
    "choices": [
      "属性を別DBに移す",
      "関連をエンティティ化する",
      "関連を削除する",
      "1対1の関連に変える"
    ],
    "answer": 1,
    "explanation": "ゴルフDBの考え方2（スコアカードをエンティティ化）です。スキーマは同じ構造になります。"
  },
  {
    "id": "DB03-27",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "CREATE TABLE",
      "複合キー"
    ],
    "question": "主キーが複合キー(cd_id, track_number)の場合のCREATE TABLE内での書き方はどれか。",
    "choices": [
      "PRIMARY KEY (cd_id, track_number)",
      "cd_id PRIMARY KEY, track_number PRIMARY KEY",
      "PRIMARY KEY cd_id AND track_number",
      "KEY(cd_id + track_number)"
    ],
    "answer": 0,
    "explanation": "複合キーはカラム定義の後にまとめて書きます。"
  },
  {
    "id": "DB03-28",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "CREATE TABLE",
      "外部キー"
    ],
    "question": "cdsテーブルのartist_idがartistsテーブルのidを参照する外部キー設定の書き方はどれか。",
    "choices": [
      "REFERENCES artist_id TO artists.id",
      "FOREIGN KEY artists(id) = artist_id",
      "artist_id FOREIGN artists",
      "FOREIGN KEY (artist_id) REFERENCES artists(id)"
    ],
    "answer": 3,
    "explanation": "FOREIGN KEY (このテーブルのカラム) REFERENCES 参照先テーブル(カラム)。"
  },
  {
    "id": "DB03-29",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "主キー制約"
    ],
    "question": "主キー制約により、エラーとなる操作はどれか。",
    "choices": [
      "主キーで検索する",
      "主キーで並べ替える",
      "主キーのカラムに既存と重複する値やNULLを登録する",
      "主キー以外のカラムにNULLを登録する"
    ],
    "answer": 2,
    "explanation": "主キー制約は重複とNULLを禁止します。"
  },
  {
    "id": "DB03-30",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "外部キー制約"
    ],
    "question": "外部キー制約により、エラーとなる操作はどれか。",
    "choices": [
      "外部キーにインデックスを張る",
      "外部キーのカラムへ参照先に存在しない値を設定する",
      "参照先テーブルに新しいレコードを追加する",
      "外部キーで検索する"
    ],
    "answer": 1,
    "explanation": "参照中の値を参照先で削除しようとしてもエラーになります。"
  },
  {
    "id": "DB03-31",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "SQLite3",
      "外部キー制約"
    ],
    "question": "SQLite3の外部キー制約について正しいものはどれか。",
    "choices": [
      "デフォルトで無効で、PRAGMA foreign_keys=true; で有効になる",
      "デフォルトで有効で無効にできない",
      "SQLite3では外部キーを定義できない",
      "CREATE TABLE時にENABLEと書くと有効になる"
    ],
    "answer": 0,
    "explanation": "SQLite3は外部キー制約がデフォルト無効です。"
  },
  {
    "id": "DB03-32",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "INSERT",
      "外部キー制約"
    ],
    "question": "insert_into.sqlのように複数のINSERT文をファイルに書いて実行するときの注意点はどれか。",
    "choices": [
      "順番は自由で自動的に並べ替えられる",
      "主キーが重複してもエラーにならない",
      "DROP TABLEを先頭に書く必要がある",
      "上から順に実行されるので、外部キー制約に抵触しない順番にする"
    ],
    "answer": 3,
    "explanation": "参照先のレコードを先に挿入する必要があります。"
  },
  {
    "id": "DB03-33",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "SQLite3"
    ],
    "question": "sqlite3コマンドで存在しないDBファイル名を指定して起動するとどうなるか。",
    "choices": [
      "サンプルデータベースが作られる",
      "直前に使ったDBに接続する",
      "新しく空の（テーブルが一つもない）データベースが作られる",
      "エラーで起動しない"
    ],
    "answer": 2,
    "explanation": "ファイル名を間違えた場合も空のDBができてしまうので注意。"
  },
  {
    "id": "DB03-34",
    "lecture": "第3回 概念設計・論理設計",
    "tags": [
      "ER図",
      "演習"
    ],
    "question": "「1つの店舗は複数の注文を受け付け、1つの注文は1つの店舗が受け付ける。1つの注文は1人の顧客が発注し、1人の顧客は複数の注文をする」。正しい関連はどれか。",
    "choices": [
      "店舗：顧客＝1対1",
      "店舗：注文＝1対多、顧客：注文＝1対多",
      "店舗：注文＝多対多、顧客：注文＝多対多",
      "店舗：注文＝1対1、顧客：注文＝1対多"
    ],
    "answer": 1,
    "explanation": "注文側が「多」です。"
  },
  {
    "id": "DB04-01",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "SQLite3",
      "間接実行"
    ],
    "question": "SQL文をファイルに書いておき、SQLiteプロンプトで .read ファイル名 で実行する方法を何というか。",
    "choices": [
      "直接実行",
      "バッチ結合",
      "埋め込み実行",
      "間接実行"
    ],
    "answer": 3,
    "explanation": "ファイルなので修正して再実行が容易で、履歴も残せます。"
  },
  {
    "id": "DB04-02",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "SQLite3",
      "ファイル出力"
    ],
    "question": "SQLiteプロンプトで引数なしの .output を実行するとどうなるか。",
    "choices": [
      "SQLite3を終了する",
      "出力形式をcsvにする",
      "ファイル出力を終了して画面出力に戻る",
      "全テーブルを出力する"
    ],
    "answer": 2,
    "explanation": ".output ファイル名 で以降の出力がファイルに書き込まれます。"
  },
  {
    "id": "DB04-03",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "シェル"
    ],
    "question": "macOSのターミナルでカレントディレクトリを表示するコマンドはどれか。",
    "choices": [
      "ls -a",
      "pwd",
      "cd",
      "open ."
    ],
    "answer": 1,
    "explanation": "cd（引数なし）はホームへ移動、open . はFinderで開きます。"
  },
  {
    "id": "DB04-04",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "SELECT",
      "例題"
    ],
    "question": "SELECT d.name FROM departments d WHERE d.floor=1; が検索するものはどれか。",
    "choices": [
      "1階にある売場の名前",
      "1番の店舗の売場名",
      "売場IDが1の売場",
      "1人のマネージャが担当する売場"
    ],
    "answer": 0,
    "explanation": "floorは売場テーブルの階数カラムです。"
  },
  {
    "id": "DB04-05",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "SQL作成"
    ],
    "question": "employees(id, name, salary, manager_id, birth_year, start_year)（manager_id は上司の社員番号） から「1988年生まれの社員の名前」を出力するSQL文はどれか。",
    "choices": [
      "SELECT birth_year FROM employees WHERE name=1988;",
      "SELECT name FROM employees WHERE start_year=1988;",
      "SELECT * FROM employees ORDER BY 1988;",
      "SELECT name FROM employees WHERE birth_year=1988;"
    ],
    "answer": 3,
    "explanation": "使用テーブル→選択条件→出力内容の順に決めます。"
  },
  {
    "id": "DB04-06",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "SQL作成",
      "選択条件"
    ],
    "question": "「2010年代に就職した社員」を表すWHERE句はどれか。",
    "choices": [
      "WHERE 2010 < start_year OR start_year <= 2020",
      "WHERE birth_year >= 2010",
      "WHERE 2010 <= start_year AND start_year < 2020",
      "WHERE start_year = 2010"
    ],
    "answer": 2,
    "explanation": "2010〜2019年を範囲指定します。"
  },
  {
    "id": "DB04-07",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "SQL作成",
      "手順"
    ],
    "question": "複数のテーブルを使う問合せのSQL文を組み立てるとき、この科目の解答例で使われている考える順番はどれか。",
    "choices": [
      "ORDER BY→FROM→SELECT",
      "使用するテーブル（FROM）→選択条件（WHERE）→出力内容（SELECT）",
      "SELECT→FROM→WHERE",
      "WHERE→SELECT→FROM"
    ],
    "answer": 1,
    "explanation": "最後に内容をつなげてSQL文を作ります。"
  },
  {
    "id": "DB04-08",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "結合",
      "読解"
    ],
    "question": "SELECT d.name, e.name FROM departments d JOIN employees e ON d.manager_id = e.id; が検索するものはどれか。",
    "choices": [
      "売場名とその売場のマネージャの氏名",
      "売場名とその売場で働く全社員の氏名",
      "社員名とその上司の氏名",
      "すべての売場と社員の組み合わせ"
    ],
    "answer": 0,
    "explanation": "manager_id=e.id でマネージャ本人に結合します。"
  },
  {
    "id": "DB04-09",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "自己結合",
      "読解"
    ],
    "question": "SELECT m.name, e.name FROM employees m JOIN employees e ON m.id = e.manager_id; が検索するものはどれか。",
    "choices": [
      "同姓同名の社員の組",
      "社員と所属売場",
      "給料の高い順の社員",
      "上司（マネージャ）の氏名とその部下の氏名"
    ],
    "answer": 3,
    "explanation": "mが上司、eが部下を表す自己結合です。"
  },
  {
    "id": "DB04-10",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "自己結合",
      "読解"
    ],
    "question": "employees(id, name, salary, manager_id, birth_year, start_year)（manager_id は上司の社員番号） で、SELECT m.name, e.name FROM employees m JOIN employees e ON m.id = e.manager_id WHERE m.salary < e.salary; が検索するものはどれか。",
    "choices": [
      "給料が同じ上司と部下",
      "マネージャでない社員",
      "上司より給料が高い部下とその上司の氏名",
      "部下より給料が高い上司とその部下"
    ],
    "answer": 2,
    "explanation": "m（上司）の給料 < e（部下）の給料。"
  },
  {
    "id": "DB04-11",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "like",
      "読解"
    ],
    "question": "SELECT * FROM employees e WHERE e.name like '山%'; が検索するものはどれか。",
    "choices": [
      "名前が「山」1文字の社員",
      "名前が「山」で始まる社員のすべての情報",
      "名前に「山」を含む社員",
      "名前が「山」で終わる社員"
    ],
    "answer": 1,
    "explanation": "%は任意の文字列です。"
  },
  {
    "id": "DB04-12",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "結合",
      "読解"
    ],
    "question": "items i と suppliers r を ON r.id = i.supplier_id、departments d と ON d.id = i.department_id で結合し WHERE r.name='CHAP' として d.name を出力する。何を検索しているか。",
    "choices": [
      "仕入先CHAPが供給する商品を扱う売場の名前",
      "CHAPという名前の売場",
      "CHAPで働く社員",
      "CHAPという商品の価格"
    ],
    "answer": 0,
    "explanation": "商品を介した3テーブルの結合です。"
  },
  {
    "id": "DB04-13",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "結合",
      "SQL作成"
    ],
    "question": "departments(id, name, store_id, floor, manager_id)（manager_id はその売場を担当するマネージャの社員番号） と employees(id, name, salary, manager_id, birth_year, start_year)（manager_id は上司の社員番号） で、「store_id=5 の売場の名前と、その売場のマネージャの氏名」を出力するSQL文はどれか。",
    "choices": [
      "SELECT d.name, m.name FROM departments d JOIN employees m ON d.manager_id = m.manager_id WHERE d.store_id = 5;",
      "SELECT d.name FROM departments d WHERE d.manager_id = 5;",
      "SELECT d.name, m.name FROM departments d JOIN stores m ON d.store_id = m.id WHERE d.id = 5;",
      "SELECT d.name, m.name FROM departments d JOIN employees m ON d.manager_id = m.id WHERE d.store_id = 5;"
    ],
    "answer": 3,
    "explanation": "マネージャ本人なので d.manager_id = m.id です。"
  },
  {
    "id": "DB04-14",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "結合",
      "選択条件"
    ],
    "question": "departments(id, name, store_id, floor, manager_id)（manager_id はその売場を担当するマネージャの社員番号） と employees(id, name, salary, manager_id, birth_year, start_year)（manager_id は上司の社員番号） を FROM departments d JOIN employees m ON d.manager_id = m.id で結合し、「salary が 20000 以上のマネージャと担当の売場名」を出力する。使う WHERE 句はどれか。",
    "choices": [
      "WHERE m.salary > 20000",
      "WHERE salary = 20000",
      "WHERE m.salary >= 20000",
      "WHERE d.salary >= 20000"
    ],
    "answer": 2,
    "explanation": "以上なので >= を使います。"
  },
  {
    "id": "DB04-15",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "結合",
      "3テーブル"
    ],
    "question": "items(id, name, department_id, price, qoh, supplier_id)・departments(id, name, store_id, floor, manager_id)・stores(id, name, address)・employees・suppliers がある。「20000円以上の商品の名前と、その商品を扱う売場の名前と、店舗の住所」を出力するときに結合するテーブルの組み合わせはどれか。",
    "choices": [
      "items, suppliers, stores",
      "items, departments, stores",
      "items, employees, stores",
      "departments, employees, suppliers"
    ],
    "answer": 1,
    "explanation": "i.department_id = d.id、d.store_id = s.id で結合します。"
  },
  {
    "id": "DB04-16",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "選択条件",
      "演習"
    ],
    "question": "employees(id, name, salary, manager_id, birth_year, start_year)（manager_id は上司の社員番号） で「23歳以上で入社した社員」を表す WHERE 句はどれか（年齢は年の差で考える）。",
    "choices": [
      "WHERE start_year - birth_year >= 23",
      "WHERE birth_year - start_year >= 23",
      "WHERE start_year >= 23",
      "WHERE age > 23"
    ],
    "answer": 0,
    "explanation": "入社年−生年で入社時の年齢を計算します。"
  },
  {
    "id": "DB04-17",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "SQL作成",
      "CDジャケットDB"
    ],
    "question": "「作詞者と作曲者が等しい曲をすべて表示」するSQL文はどれか。",
    "choices": [
      "SELECT title FROM music m JOIN artists a ON m.id = a.id;",
      "SELECT title FROM artists WHERE composer = lyricist;",
      "SELECT * FROM music, artists;",
      "SELECT title FROM music WHERE composer_id = lyricist_id;"
    ],
    "answer": 3,
    "explanation": "musicテーブルだけで判断できます。"
  },
  {
    "id": "DB04-18",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "結合",
      "CDジャケットDB"
    ],
    "question": "cds(id, title, artist_id, …)・tracks(cd_id, track_number, music_id, length)・music(id, title, composer_id, lyricist_id)・artists(id, name, …) がある（cds.artist_id はそのCDのアーティスト）。「椎名林檎のCDに含まれる曲の曲名をすべて表示」するときに結合する経路として正しいものはどれか。",
    "choices": [
      "artists → play → music",
      "cds → companies → music",
      "artists → cds → tracks → music",
      "artists → music（composer_id）"
    ],
    "answer": 2,
    "explanation": "c.artist_id=a.id、t.cd_id=c.id、m.id=t.music_id で結合します。"
  },
  {
    "id": "DB04-19",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "結合",
      "複合キー"
    ],
    "question": "play(cd_id, track_number, artist_id, role) と tracks(cd_id, track_number, …) の結合条件として正しいものはどれか。",
    "choices": [
      "p.track_number = t.track_number のみ",
      "p.cd_id = t.cd_id AND p.track_number = t.track_number",
      "p.cd_id = t.cd_id のみ",
      "p.artist_id = t.music_id"
    ],
    "answer": 1,
    "explanation": "複合キーなので両方のカラムで結合します。"
  },
  {
    "id": "DB04-20",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "読解",
      "CDジャケットDB"
    ],
    "question": "artists(id, name, …)・play(cd_id, track_number, artist_id, role)・tracks(cd_id, track_number, music_id, length)・music(id, title, …) を結合し、WHERE p.role = 'vocal' として a.name, m.title を出力するSQL文の意味はどれか。",
    "choices": [
      "ボーカル名と曲タイトルの対応表",
      "作曲者名と曲タイトルの対応表",
      "CDを出したアーティストと曲名",
      "作詞者名と曲タイトル"
    ],
    "answer": 0,
    "explanation": "a.id=m.composer_id で結合すれば作曲者名と曲タイトルになります。"
  },
  {
    "id": "DB04-21",
    "lecture": "第4回 データベースの検索",
    "tags": [
      "読解"
    ],
    "question": "SELECT id, name, price FROM items WHERE qoh<200; の qoh の意味と検索内容はどれか。",
    "choices": [
      "価格が200未満の商品",
      "発注数が200未満の商品",
      "品質が200未満の商品",
      "quantity on hand（手持在庫）が200未満の商品のid・名前・値段"
    ],
    "answer": 3,
    "explanation": "qoh = quantity on hand です。"
  },
  {
    "id": "DB05-01",
    "lecture": "第5回 関係代数",
    "tags": [
      "関係代数",
      "閉包性"
    ],
    "question": "関係代数の「閉包性」の説明として正しいものはどれか。",
    "choices": [
      "関係同士の演算結果は関係になり、さらに別の演算に使える",
      "演算結果は必ず空になる",
      "関係は1回しか演算できない",
      "演算結果は数値になる"
    ],
    "answer": 0,
    "explanation": "関係の集合は関係代数の演算子について閉じています。"
  },
  {
    "id": "DB05-02",
    "lecture": "第5回 関係代数",
    "tags": [
      "関係代数",
      "SQL"
    ],
    "question": "関係代数とSQLの関係として正しいものはどれか。",
    "choices": [
      "SQLと関係代数は無関係",
      "関係代数はSQLを実装したもの",
      "関係代数はSQLの一部の方言",
      "SQLは関係代数を実装したもの"
    ],
    "answer": 3,
    "explanation": "SQLの使いこなしやDB設計には関係代数の知識が必要です。"
  },
  {
    "id": "DB05-03",
    "lecture": "第5回 関係代数",
    "tags": [
      "集合演算",
      "和両立"
    ],
    "question": "和両立(Union Compatible)の条件はどれか。",
    "choices": [
      "主キーが同じ名前である",
      "属性名がすべて異なる",
      "次数が等しく、属性の型（定義域）の並びがすべて一致している",
      "タプル数が等しい"
    ],
    "answer": 2,
    "explanation": "和・差・共通には和両立が必要です。"
  },
  {
    "id": "DB05-04",
    "lecture": "第5回 関係代数",
    "tags": [
      "集合演算",
      "直積"
    ],
    "question": "和両立でなくても計算できる集合演算はどれか。",
    "choices": [
      "共通",
      "直積",
      "和",
      "差"
    ],
    "answer": 1,
    "explanation": "直積はすべての組み合わせを求めるので和両立でなくてもよいです。"
  },
  {
    "id": "DB05-05",
    "lecture": "第5回 関係代数",
    "tags": [
      "単項演算"
    ],
    "question": "関係代数の単項演算（1つの関係⇒1つの関係）の組み合わせはどれか。",
    "choices": [
      "選択と射影",
      "結合と商",
      "和と差",
      "直積と共通"
    ],
    "answer": 0,
    "explanation": "結合と商は二項演算です。"
  },
  {
    "id": "DB05-06",
    "lecture": "第5回 関係代数",
    "tags": [
      "選択"
    ],
    "question": "関係代数の演算子 σ（シグマ）が表す演算はどれか。",
    "choices": [
      "射影",
      "結合",
      "商",
      "選択"
    ],
    "answer": 3,
    "explanation": "述語Pを真とするタプルの集合を求めます。"
  },
  {
    "id": "DB05-07",
    "lecture": "第5回 関係代数",
    "tags": [
      "射影"
    ],
    "question": "関係代数の演算子 π（パイ）が表す演算はどれか。",
    "choices": [
      "直積",
      "和",
      "射影",
      "選択"
    ],
    "answer": 2,
    "explanation": "いくつかの属性を選択する（次数の削減）演算です。"
  },
  {
    "id": "DB05-08",
    "lecture": "第5回 関係代数",
    "tags": [
      "射影"
    ],
    "question": "関係データベースの操作のうち、射影の説明として適切なものはどれか。",
    "choices": [
      "2つの表の照会結果を合わせて一つの表にする",
      "表の中から特定の列だけを取り出す",
      "表の中から特定の条件に合致した行を取り出す",
      "2つの表から条件に合致した組同士を合わせて新しい表を作る"
    ],
    "answer": 1,
    "explanation": "行を取り出すのは選択、組同士を合わせるのは結合です。"
  },
  {
    "id": "DB05-09",
    "lecture": "第5回 関係代数",
    "tags": [
      "射影",
      "重複"
    ],
    "question": "射影によってタプル数が減ることがある理由はどれか。",
    "choices": [
      "属性を減らした結果重複するタプルが除去されるから",
      "主キーが削除されるから",
      "NULLが除去されるから",
      "条件を満たさないタプルが除かれるから"
    ],
    "answer": 0,
    "explanation": "例：π_floor departments は21タプル⇒6タプル。"
  },
  {
    "id": "DB05-10",
    "lecture": "第5回 関係代数",
    "tags": [
      "射影",
      "SQL"
    ],
    "question": "π_floor(departments) に相当するSQL文はどれか。",
    "choices": [
      "SELECT floor FROM departments;",
      "SELECT * FROM departments WHERE floor;",
      "SELECT COUNT(floor) FROM departments;",
      "SELECT DISTINCT floor FROM departments;"
    ],
    "answer": 3,
    "explanation": "重複除去のためDISTINCTが必要です。"
  },
  {
    "id": "DB05-11",
    "lecture": "第5回 関係代数",
    "tags": [
      "選択",
      "SQL"
    ],
    "question": "σ_floor>2(departments) に相当するSQL文はどれか。",
    "choices": [
      "SELECT DISTINCT floor>2 FROM departments;",
      "SELECT * FROM departments GROUP BY floor;",
      "SELECT * FROM departments WHERE floor>2;",
      "SELECT floor FROM departments;"
    ],
    "answer": 2,
    "explanation": "選択はWHERE句に対応します。"
  },
  {
    "id": "DB05-12",
    "lecture": "第5回 関係代数",
    "tags": [
      "関係演算とSQL"
    ],
    "question": "SELECT DISTINCT … FROM … JOIN … ON … WHERE …; において、SELECT句・JOIN…ON・WHERE句がそれぞれ対応する関係演算はどれか。",
    "choices": [
      "結合・選択・射影",
      "射影・結合・選択",
      "選択・結合・射影",
      "射影・直積・商"
    ],
    "answer": 1,
    "explanation": "SELECT句が射影、JOINが結合、WHEREが選択です。"
  },
  {
    "id": "DB05-13",
    "lecture": "第5回 関係代数",
    "tags": [
      "結合"
    ],
    "question": "結合(join)の説明として正しいものはどれか。",
    "choices": [
      "直積から結合条件を満たすタプルを選択して2つの関係を合成する",
      "2つの関係のどちらかに含まれるタプルを集める",
      "片方の関係のみに存在するタプルを求める",
      "いくつかの属性を取り出す"
    ],
    "answer": 0,
    "explanation": "結合＝直積＆選択。演算子は⋈です。"
  },
  {
    "id": "DB05-14",
    "lecture": "第5回 関係代数",
    "tags": [
      "差集合"
    ],
    "question": "本店メニューRhと支店メニューRaについて、Rh − Ra が表すものはどれか。",
    "choices": [
      "支店のみのメニュー",
      "両方にあるメニュー",
      "どちらかにあるメニュー",
      "本店のみのメニュー"
    ],
    "answer": 3,
    "explanation": "差集合は片方の関係のみに存在するタプルです。"
  },
  {
    "id": "DB05-15",
    "lecture": "第5回 関係代数",
    "tags": [
      "共通集合",
      "演習"
    ],
    "question": "Ra = {R001, C001, H002, M001, M005}、Rb = {R001, C003, H001, M002, M005}（同じ商品番号は同じタプル）のとき Ra ∩ Rb はどれか。",
    "choices": [
      "C003, H001, M002",
      "すべての商品",
      "R001, M005",
      "C001, H002, M001"
    ],
    "answer": 2,
    "explanation": "共通集合は両方にあるタプルです。"
  },
  {
    "id": "DB05-16",
    "lecture": "第5回 関係代数",
    "tags": [
      "差集合",
      "演習"
    ],
    "question": "Ra = {R001, C001, H002, M001, M005}、Rb = {R001, C003, H001, M002, M005}（同じ商品番号は同じタプル）のとき Ra − Rb はどれか。",
    "choices": [
      "空集合",
      "C001, H002, M001",
      "C003, H001, M002",
      "R001, M005"
    ],
    "answer": 1,
    "explanation": "Raにあり、Rbにないタプルです。"
  },
  {
    "id": "DB05-17",
    "lecture": "第5回 関係代数",
    "tags": [
      "直積",
      "演習"
    ],
    "question": "販売リストR（3タプル、3属性）と取り扱い商品リストS（2タプル、3属性）の直積R×Sのタプル数と次数はどれか。",
    "choices": [
      "6タプル、6属性",
      "5タプル、3属性",
      "6タプル、3属性",
      "9タプル、6属性"
    ],
    "answer": 0,
    "explanation": "タプル数は積、属性はRとS両方を持ちます。"
  },
  {
    "id": "DB05-18",
    "lecture": "第5回 関係代数",
    "tags": [
      "結合",
      "演習"
    ],
    "question": "R(A,B) = {(a,1),(a,2),(b,1)}、S(C,D) = {(a,2),(b,3),(b,4),(b,5)} のとき R ⋈_{A=C} S のタプル数はどれか。",
    "choices": [
      "3",
      "4",
      "12",
      "5"
    ],
    "answer": 3,
    "explanation": "aの2タプル×(a,2)で2、bの1タプル×bの3タプルで3、計5。"
  },
  {
    "id": "DB05-19",
    "lecture": "第5回 関係代数",
    "tags": [
      "結合",
      "利用パターン"
    ],
    "question": "π_d.name(departments d ⋈ σ_address like '%渋谷区%'(stores s)) のように、一方の関係に選択条件を与え他方のタプルを選ぶ結合の利用パターンはどれか。",
    "choices": [
      "補足",
      "商",
      "間接選択",
      "全合成"
    ],
    "answer": 2,
    "explanation": "全合成・補足・間接選択の3パターンがあります。"
  },
  {
    "id": "DB05-20",
    "lecture": "第5回 関係代数",
    "tags": [
      "結合",
      "利用パターン"
    ],
    "question": "一方の関係(departments)が主役で、他方の関係(stores)の属性(address)を補足的に付加する結合の利用パターンはどれか。",
    "choices": [
      "自己結合",
      "補足",
      "全合成",
      "間接選択"
    ],
    "answer": 1,
    "explanation": "SELECT d.*, s.address FROM … JOIN … の形です。"
  },
  {
    "id": "DB05-21",
    "lecture": "第5回 関係代数",
    "tags": [
      "商"
    ],
    "question": "N次の関係をK次の関係で割った商の次数はどれか。",
    "choices": [
      "N−K次",
      "N＋K次",
      "N×K次",
      "K次"
    ],
    "answer": 0,
    "explanation": "余剰はN次です。X÷Y=Q…R のとき (Y×Q)∪R=X。"
  },
  {
    "id": "DB05-22",
    "lecture": "第5回 関係代数",
    "tags": [
      "商",
      "演習"
    ],
    "question": "履修X(科目, 学生)を Y(科目)={数学, 英語} で割った商 X÷Y の意味として正しいものはどれか。",
    "choices": [
      "数学か英語のどちらかを履修している学生",
      "数学も英語も履修していない学生",
      "数学と英語の履修者数",
      "数学と英語の両方を履修している学生"
    ],
    "answer": 3,
    "explanation": "資料の例では鈴木と田中が商になります。"
  },
  {
    "id": "DB05-23",
    "lecture": "第5回 関係代数",
    "tags": [
      "関係完備"
    ],
    "question": "関係完備の説明として正しいものはどれか。",
    "choices": [
      "すべての関係が正規化されていること",
      "関係代数の演算子がすべて単項であること",
      "関係代数や関係論理と同等の表現力を持つこと（SQLは関係完備）",
      "すべての関係に主キーがあること"
    ],
    "answer": 2,
    "explanation": "関係代数と関係論理の表現能力は等しいです。"
  },
  {
    "id": "DB05-24",
    "lecture": "第5回 関係代数",
    "tags": [
      "質問の等価変換"
    ],
    "question": "「質問の等価変換」について正しいものはどれか。",
    "choices": [
      "射影は必ず最初に行わなければならない",
      "1つのSQL質問は何通りもの関係代数式で表せる",
      "1つのSQL質問は1つの関係代数式にしか対応しない",
      "SQLは関係代数式に変換できない"
    ],
    "answer": 1,
    "explanation": "質問木の形を変えても同じ結果になります。"
  },
  {
    "id": "DB05-25",
    "lecture": "第5回 関係代数",
    "tags": [
      "集約関数"
    ],
    "question": "SQLの集約関数ではないものはどれか。",
    "choices": [
      "DISTINCT",
      "COUNT",
      "SUM",
      "AVG"
    ],
    "answer": 0,
    "explanation": "集約関数はCOUNT, SUM, AVG, MAX, MINです。"
  },
  {
    "id": "DB05-26",
    "lecture": "第5回 関係代数",
    "tags": [
      "集約関数",
      "COUNT"
    ],
    "question": "SELECT COUNT(DISTINCT manager_id) FROM employees; の結果（19）が表すものはどれか。",
    "choices": [
      "社員数",
      "売場数",
      "NULLの数",
      "マネージャの数"
    ],
    "answer": 3,
    "explanation": "manager_idの重複を除いた行数です。COUNT(*)は社員数58。"
  },
  {
    "id": "DB05-27",
    "lecture": "第5回 関係代数",
    "tags": [
      "GROUP BY"
    ],
    "question": "emp(id, name, dept, salary) に 田中 家具 1000、山田 食品 1200、高橋 食品 900、山下 家具 1100、田中 玩具 700、大田 食品 800 の6行がある。SELECT dept, COUNT(*), SUM(salary) FROM emp GROUP BY dept; の家具の行はどれか。",
    "choices": [
      "家具 2 1050",
      "家具 3 2900",
      "家具 2 2100",
      "家具 1 1000"
    ],
    "answer": 2,
    "explanation": "GROUP BY句に指定したカラム名はSELECT句にも書きます。"
  },
  {
    "id": "DB05-28",
    "lecture": "第5回 関係代数",
    "tags": [
      "GROUP BY",
      "WHERE"
    ],
    "question": "emp(id, name, dept, salary) に 田中 家具 1000、山田 食品 1200、高橋 食品 900、山下 家具 1100、田中 玩具 700、大田 食品 800 の6行がある。SELECT dept, COUNT(*), SUM(salary) FROM emp WHERE salary > 900 GROUP BY dept; の食品の行はどれか。",
    "choices": [
      "食品 0 0",
      "食品 1 1200",
      "食品 3 2900",
      "食品 2 2100"
    ],
    "answer": 1,
    "explanation": "WHEREはグループ化する前の選択条件です。"
  },
  {
    "id": "DB05-29",
    "lecture": "第5回 関係代数",
    "tags": [
      "GROUP BY",
      "HAVING"
    ],
    "question": "emp(id, name, dept, salary) に 田中 家具 1000、山田 食品 1200、高橋 食品 900、山下 家具 1100、田中 玩具 700、大田 食品 800 の6行がある。SELECT dept FROM emp GROUP BY dept HAVING AVG(salary) > 900; の結果に現れない部門はどれか。",
    "choices": [
      "玩具",
      "家具",
      "食品",
      "すべて現れる"
    ],
    "answer": 0,
    "explanation": "玩具の平均は700。HAVINGはグループ化した後の選択条件です。"
  },
  {
    "id": "DB05-30",
    "lecture": "第5回 関係代数",
    "tags": [
      "WHERE",
      "HAVING"
    ],
    "question": "WHERE句とHAVING句の違いとして正しいものはどれか。",
    "choices": [
      "WHEREはグループ化後、HAVINGはグループ化前",
      "どちらも同じ意味",
      "HAVINGはJOINの条件",
      "WHEREはグループ化前、HAVINGはグループ化後（集約結果）の選択条件"
    ],
    "answer": 3,
    "explanation": "HAVINGでは集約関数を条件にできます。"
  },
  {
    "id": "DB05-31",
    "lecture": "第5回 関係代数",
    "tags": [
      "SELECT文",
      "句の順番"
    ],
    "question": "SELECT文に現れる句の正しい順番はどれか。",
    "choices": [
      "FROM, SELECT, WHERE, ORDER BY, GROUP BY, HAVING",
      "SELECT, FROM, GROUP BY, WHERE, ORDER BY, HAVING",
      "SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY",
      "SELECT, WHERE, FROM, HAVING, GROUP BY, ORDER BY"
    ],
    "answer": 2,
    "explanation": "この順番に書きます。"
  },
  {
    "id": "DB05-32",
    "lecture": "第5回 関係代数",
    "tags": [
      "内部結合"
    ],
    "question": "普通の結合（内部結合）の性質として正しいものはどれか。",
    "choices": [
      "直積と同じ結果になる",
      "結合条件を満たす相手が無いレコードは結果に現れない",
      "すべてのレコードが結果に現れる",
      "相手が無いレコードはNULLと結合する"
    ],
    "answer": 1,
    "explanation": "相手が無いレコードを残したいときは外部結合を使います。"
  },
  {
    "id": "DB05-33",
    "lecture": "第5回 関係代数",
    "tags": [
      "外部結合"
    ],
    "question": "左外部結合(LEFT OUTER JOIN)の説明として正しいものはどれか。",
    "choices": [
      "左辺のテーブルのレコードがすべて結果に現れ、相手が無い場合は右辺の代わりにNULLと結合する",
      "右辺のテーブルのレコードがすべて結果に現れる",
      "両辺のテーブルのレコードがすべて結果に現れる",
      "左辺のレコードのうち相手が無いものだけが現れる"
    ],
    "answer": 0,
    "explanation": "右外部結合は右辺、完全外部結合は両辺がすべて現れます。"
  },
  {
    "id": "DB05-34",
    "lecture": "第5回 関係代数",
    "tags": [
      "外部結合",
      "NULL"
    ],
    "question": "外部結合を使うべき場面として適切なものはどれか。",
    "choices": [
      "主キーで結合する場合",
      "必ず相手が存在する場合",
      "集約関数を使う場合",
      "結合条件で使う列にNULLが現れる可能性がある場合"
    ],
    "answer": 3,
    "explanation": "NULLとの比較は真にならないので内部結合では消えてしまいます。"
  },
  {
    "id": "DB05-35",
    "lecture": "第5回 関係代数",
    "tags": [
      "外部結合",
      "演習"
    ],
    "question": "販売リストR（8行。そのうち商品番号が H002 の1行と C001 の1行は、Sに同じ商品番号が無い）と取り扱い商品リストS（5行。商品番号は重複せず、そのうち M005 はRのどの行からも参照されない）を、商品番号が等しいことを条件に完全外部結合したときの行数はどれか。",
    "choices": [
      "6行",
      "7行",
      "9行",
      "8行"
    ],
    "answer": 2,
    "explanation": "内部結合6行＋Rのみ2行＋Sのみ1行＝9行。"
  },
  {
    "id": "DB05-36",
    "lecture": "第5回 関係代数",
    "tags": [
      "集約関数",
      "演習"
    ],
    "question": "shipping(product_id, shipped_on, quantity) に（NP200, 2025-10-10, 3）（FP233, 2025-10-10, 2）（NP200, 2025-10-11, 1）（FP233, 2025-10-11, 2）の4行があるとき、最も大きな値が得られるものはどれか。",
    "choices": [
      "SELECT SUM(quantity) FROM shipping WHERE shipped_on='2025-10-11';",
      "SELECT COUNT(*) FROM shipping;",
      "SELECT AVG(quantity) FROM shipping WHERE product_id='NP200';",
      "SELECT MAX(quantity) FROM shipping;"
    ],
    "answer": 1,
    "explanation": "COUNT(*)=4、MAX=3、NP200のAVG=(3+1)/2=2、2025-10-11のSUM=1+2=3 です。"
  },
  {
    "id": "DB05-37",
    "lecture": "第5回 関係代数",
    "tags": [
      "集約関数",
      "演習"
    ],
    "question": "products の unit_price で、生産地が名古屋市の製品は部品C(300)と製品F(4900)。SELECT AVG(unit_price) FROM products WHERE origin='名古屋市'; の結果はどれか。",
    "choices": [
      "2600",
      "5200",
      "300",
      "4900"
    ],
    "answer": 0,
    "explanation": "(300+4900)/2 = 2600。"
  },
  {
    "id": "DB05-38",
    "lecture": "第5回 関係代数",
    "tags": [
      "GROUP BY",
      "演習"
    ],
    "question": "cities で神奈川県は横浜市372.5と川崎市147.5。SELECT prefecture, AVG(population) FROM cities GROUP BY prefecture; の神奈川県の値はどれか。",
    "choices": [
      "520",
      "372.5",
      "147.5",
      "260"
    ],
    "answer": 3,
    "explanation": "(372.5+147.5)/2 = 260。"
  },
  {
    "id": "DB05-39",
    "lecture": "第5回 関係代数",
    "tags": [
      "ORDER BY"
    ],
    "question": "ORDER BY population DESC の並び順はどれか。",
    "choices": [
      "挿入した順",
      "ランダム",
      "値の大きい順（降順）",
      "値の小さい順（昇順）"
    ],
    "answer": 2,
    "explanation": "DESCは降順、ASCは昇順です。"
  },
  {
    "id": "DB05-40",
    "lecture": "第5回 関係代数",
    "tags": [
      "結合",
      "演習"
    ],
    "question": "orders に P2,P1,P4,P8,P1,P3 の6件（P8はproductsに存在しない）があり、SELECT p.name, o.quantity FROM orders o JOIN products p ON o.product_id=p.id; を実行した結果の行数はどれか。",
    "choices": [
      "7行",
      "5行",
      "6行",
      "4行"
    ],
    "answer": 1,
    "explanation": "内部結合なので相手のいないP8の行は現れません。PCの行は2回出ます。"
  },
  {
    "id": "DB05-41",
    "lecture": "第5回 関係代数",
    "tags": [
      "入れ子質問"
    ],
    "question": "WHERE dept_id = (SELECT id FROM dept WHERE name='book') のような書き方を何というか。",
    "choices": [
      "入れ子質問（副問合せ）",
      "外部結合",
      "直積",
      "自己結合"
    ],
    "answer": 0,
    "explanation": "結合を使った質問と同じ出力が得られます。"
  },
  {
    "id": "DB06-01",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "自然結合"
    ],
    "question": "自然結合の説明として正しいものはどれか。",
    "choices": [
      "同じ関係同士の結合",
      "2つの関係に共通な属性が一致することを結合条件とする内部結合",
      "共通属性を持たない2つの関係の直積",
      "左辺のタプルがすべて残る外部結合"
    ],
    "answer": 1,
    "explanation": "演算子⋈に結合条件を書かないことで表します。"
  },
  {
    "id": "DB06-02",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "無損失分解"
    ],
    "question": "関係Rの射影R1, R2について、無損失分解の定義はどれか。",
    "choices": [
      "自然結合R1 ⋈ R2がRと等しい",
      "R1とR2のタプル数の和がRに等しい",
      "R1とR2に共通属性がない",
      "R1とR2の和集合がRと等しい"
    ],
    "answer": 0,
    "explanation": "要するに元に戻すことができる分解です。"
  },
  {
    "id": "DB06-03",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "無損失分解",
      "主キー"
    ],
    "question": "R1, R2がいずれもRの主キーを含む射影であるとき、{R1, R2}について正しいものはどれか。",
    "choices": [
      "必ず情報が損失する",
      "タプル数が必ず減る",
      "自然結合できない",
      "必ずRの無損失分解となる"
    ],
    "answer": 3,
    "explanation": "射影に元の主キーが含まれるのでタプルが重複せず、自明なケースです。"
  },
  {
    "id": "DB06-04",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "射影",
      "タプル数"
    ],
    "question": "関係Rの射影πRのタプル数について正しいものはどれか。",
    "choices": [
      "|πR| = |R| が常に成り立つ",
      "|πR| は常に1",
      "|πR| ≦ |R|",
      "|πR| ≧ |R|"
    ],
    "answer": 2,
    "explanation": "重複するタプルが除去されると少なくなります。"
  },
  {
    "id": "DB06-05",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "無損失分解",
      "情報の損失"
    ],
    "question": "R(A,B,C)をR1(A,B)とR2(B,C)に分解し、共通属性BがR1でもR2でも主キーでない場合に起こりうることはどれか。",
    "choices": [
      "自然結合できなくなる",
      "自然結合すると元にないタプルが増え、情報が損失する",
      "自然結合でタプルが必ず減る",
      "必ず元に戻る"
    ],
    "answer": 1,
    "explanation": "タプルが増えて元のRと区別できなくなる＝情報の損失です。"
  },
  {
    "id": "DB06-06",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "無損失分解",
      "非キー属性"
    ],
    "question": "関係Rを射影R1, R2に分解する。共通属性KがRの非キー属性である場合、{R1, R2} が無損失分解となる条件として正しいものはどれか。",
    "choices": [
      "KがR1またはR2のどちらかで主キーになる",
      "KがR1とR2の両方で外部キーになる",
      "KがNULLを含む",
      "KがRのすべての属性を含む"
    ],
    "answer": 0,
    "explanation": "この性質が関数従属性です。"
  },
  {
    "id": "DB06-07",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "関数従属性"
    ],
    "question": "関係Rにおいて属性Yが属性Xに関数従属である（FD: X → Y）とはどういうことか。",
    "choices": [
      "Yのそれぞれの値に対応するXの値が1つしかない",
      "XとYが同じ値を持つ",
      "XがYの外部キーである",
      "Xのそれぞれの値に対応するYの値が2つ以上存在しない"
    ],
    "answer": 3,
    "explanation": "XからYに向かう線に分岐が無い（合流はあってもよい）。"
  },
  {
    "id": "DB06-08",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "関数的"
    ],
    "question": "「関数的」である（Xを決めるとYがただ1つに決まる）関係の例はどれか。",
    "choices": [
      "兄弟(X, Y)：XとYは兄弟",
      "同僚(X, Y)",
      "父子(X, Y)：Xの父親はY",
      "友達(X, Y)：XとYは友達"
    ],
    "answer": 2,
    "explanation": "誰にとっても父親は1人なので Y=父親(X) と関数的です。"
  },
  {
    "id": "DB06-09",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "関数従属性",
      "演習"
    ],
    "question": "学生(学籍番号, 氏名, email, 研究室, 内線)（各研究室に内線1本）で、関数従属ではないものはどれか。",
    "choices": [
      "内線 → 研究室",
      "研究室 → 氏名",
      "学籍番号 → email",
      "研究室 → 内線"
    ],
    "answer": 1,
    "explanation": "同じ研究室に複数の学生がいるので研究室から氏名は決まりません。"
  },
  {
    "id": "DB06-10",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "スーパーキー"
    ],
    "question": "スーパーキーの定義（一意性）として正しいものはどれか。",
    "choices": [
      "Rの任意の2タプルs≠tについて s[K]≠t[K] が成り立つ属性集合K",
      "NULLを禁止した属性",
      "他の関係から参照される属性",
      "最も属性数の少ない属性集合"
    ],
    "answer": 0,
    "explanation": "タプルを一意に区別できる属性集合です。"
  },
  {
    "id": "DB06-11",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "候補キー"
    ],
    "question": "候補キーの定義（非冗長性）として正しいものはどれか。",
    "choices": [
      "すべての属性からなる集合",
      "スーパーキーに任意の属性を加えたもの",
      "外部キーとして使える属性",
      "スーパーキーで、そのいかなる真部分集合もスーパーキーでないもの"
    ],
    "answer": 3,
    "explanation": "タプルを一意に区別できる最低限の組み合わせです。"
  },
  {
    "id": "DB06-12",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "主キー"
    ],
    "question": "関数従属性の文脈での主キーの再定義として正しいものはどれか。",
    "choices": [
      "最も多くの属性を持つ候補キー",
      "外部キーのうち1つ",
      "候補キーから1つを選びNULLを禁止したもの",
      "すべてのスーパーキー"
    ],
    "answer": 2,
    "explanation": "スーパーキー ⊃ 候補キー ⊃ 主キー の関係です。"
  },
  {
    "id": "DB06-13",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "候補キー",
      "演習"
    ],
    "question": "R(A,B,C) のタプルが (a,x,1), (b,y,1), (c,y,2), (d,z,3) の4つのとき、候補キーの組み合わせはどれか。",
    "choices": [
      "{A, B, C} のみ",
      "{A} と {B, C}",
      "{A} のみ",
      "{B} と {C}"
    ],
    "answer": 1,
    "explanation": "{A,B}などはスーパーキーだが候補キーではありません。"
  },
  {
    "id": "DB06-14",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "スーパーキー",
      "演習"
    ],
    "question": "R(A,B,C) のタプルが (a,x,1), (b,y,1), (c,y,2), (d,z,3) の4つのとき、{A, B} について正しいものはどれか。",
    "choices": [
      "スーパーキーだが候補キーではない",
      "候補キーである",
      "スーパーキーではない",
      "主キーである"
    ],
    "answer": 0,
    "explanation": "Bを外しても{A}がスーパーキーなので冗長です。"
  },
  {
    "id": "DB06-15",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "スーパーキー",
      "演習"
    ],
    "question": "R(A,B,C) のタプルが (a,x,1), (b,y,1), (c,y,2), (d,z,3) の4つのとき、スーパーキーではないものはどれか。",
    "choices": [
      "{A}",
      "{B, C}",
      "{A, B, C}",
      "{B}"
    ],
    "answer": 3,
    "explanation": "Bの値yが2タプルにあり一意に区別できません。"
  },
  {
    "id": "DB06-16",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "スーパーキー"
    ],
    "question": "emp(id, name, email, zip_code) で {id} と {email} が候補キーのとき、{email, zip_code} について正しいものはどれか。",
    "choices": [
      "スーパーキーではない",
      "外部キーである",
      "スーパーキーだが候補キーではない",
      "候補キーである"
    ],
    "answer": 2,
    "explanation": "候補キーに任意の属性を加えたものはスーパーキーです（定理2）。"
  },
  {
    "id": "DB06-17",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "スーパーキー",
      "定理"
    ],
    "question": "スーパーキーに関する定理として正しいものはどれか。",
    "choices": [
      "スーパーキーから属性を除いても必ずスーパーキー",
      "関係の属性すべての集合はスーパーキーであり、関係には必ず候補キーが存在する",
      "スーパーキーは必ず1属性からなる",
      "関係にはスーパーキーが存在しないことがある"
    ],
    "answer": 1,
    "explanation": "定理3・定理3´です。"
  },
  {
    "id": "DB06-18",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "関数従属性",
      "定理"
    ],
    "question": "Kが関係Rのスーパーキー、Aが任意の属性のとき、常に成立するものはどれか。",
    "choices": [
      "FD: K → A",
      "FD: A → K",
      "KとAは独立",
      "K = A"
    ],
    "answer": 0,
    "explanation": "スーパーキーが決まれば任意の属性も決まります（定理5）。"
  },
  {
    "id": "DB06-19",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "自明なFD"
    ],
    "question": "自明な関数従属性の説明として正しいものはどれか。",
    "choices": [
      "α ⊂ β ならば FD: α → β は必ず成立する",
      "主キーから外部キーへのFD",
      "どんな関係でも成立しないFD",
      "β ⊂ α ならば FD: α → β は必ず成立する"
    ],
    "answer": 3,
    "explanation": "例：{A,B} → A は自明です。"
  },
  {
    "id": "DB06-20",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "無損失分解",
      "定理7"
    ],
    "question": "関係 R(αβγ) で FD: α → β が成立するとき、無損失分解となる射影の組はどれか。",
    "choices": [
      "R1(α) と R2(βγ)",
      "R1(β) と R2(γ)",
      "R1(αβ) と R2(αγ)",
      "R1(αβ) と R2(βγ)"
    ],
    "answer": 2,
    "explanation": "FDの左辺αを共通属性にして分解します。"
  },
  {
    "id": "DB06-21",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "無損失分解",
      "十分条件"
    ],
    "question": "関数従属性(FD)と無損失分解の関係として正しいものはどれか。",
    "choices": [
      "FDと無損失分解は無関係",
      "FDは無損失分解のための十分条件であり、無損失分解できてもFDがないことがある",
      "FDは無損失分解の必要十分条件である",
      "FDがあると必ず情報が損失する"
    ],
    "answer": 1,
    "explanation": "FDがあれば無損失分解できますが、逆は成り立ちません。"
  },
  {
    "id": "DB06-22",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "含意"
    ],
    "question": "含意 P ⇒ Q が偽になるのはどの場合か。",
    "choices": [
      "Pが真でQが偽のとき",
      "Pが偽でQが真のとき",
      "PもQも偽のとき",
      "PもQも真のとき"
    ],
    "answer": 0,
    "explanation": "P ⇒ Q は ¬P ∨ Q と定義されます。"
  },
  {
    "id": "DB06-23",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "アームストロングの公理系"
    ],
    "question": "アームストロングの公理系の「推移律」はどれか。",
    "choices": [
      "Y ⊂ X ならば X → Y",
      "X → Y ならば XZ → YZ",
      "X → Y かつ X → Z ならば X → YZ",
      "X → Y かつ Y → Z ならば X → Z"
    ],
    "answer": 3,
    "explanation": "反射律・増加律・推移律などがあります。"
  },
  {
    "id": "DB06-24",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "アームストロングの公理系"
    ],
    "question": "アームストロングの公理系の「反射律」はどれか。",
    "choices": [
      "X → Y かつ Y → Z ならば X → Z",
      "X → YZ ならば X → Y",
      "Y ⊂ X ならば X → Y",
      "X → Y ならば XZ → YZ"
    ],
    "answer": 2,
    "explanation": "自明なFDに相当します。"
  },
  {
    "id": "DB06-25",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "アームストロングの公理系"
    ],
    "question": "アームストロングの公理系の「増加律」はどれか。",
    "choices": [
      "X → Y かつ Z ⊂ Y ならば X → Z",
      "X → Y ならば XZ → YZ",
      "Y ⊂ X ならば X → Y",
      "X → Y かつ YW → Z ならば WX → Z"
    ],
    "answer": 1,
    "explanation": "両辺に同じ属性Zを追加できます。"
  },
  {
    "id": "DB06-26",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "関数従属性",
      "導出"
    ],
    "question": "関係R(A,B,C,D)で FD: A → B と B → C が成立しているとき、論理的に導かれるものはどれか。",
    "choices": [
      "A → C",
      "C → A",
      "B → A",
      "D → A"
    ],
    "answer": 0,
    "explanation": "推移律により A → C です。"
  },
  {
    "id": "DB06-27",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "無損失分解",
      "演習"
    ],
    "question": "受注明細表(受注番号, 明細番号, 商品コード, 商品名, 数量) を FD: 商品コード → 商品名 に基づいて無損失分解した2つの関係はどれか。",
    "choices": [
      "(受注番号, 商品名) と (明細番号, 商品コード, 数量)",
      "(受注番号, 明細番号) と (商品名, 数量)",
      "(商品コード, 数量) と (受注番号, 商品名)",
      "(受注番号, 明細番号, 商品コード, 数量) と (商品コード, 商品名)"
    ],
    "answer": 3,
    "explanation": "FDの左辺（商品コード）を共通属性にします。"
  },
  {
    "id": "DB06-28",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "主キー",
      "演習"
    ],
    "question": "受注(受注No., 受注日, 顧客コード, 顧客名, 商品コード, 商品名, 単価, 数量) で1回の受注に複数の商品がある場合の主キーはどれか。",
    "choices": [
      "{顧客コード}",
      "{商品コード}",
      "{受注No., 商品コード}",
      "{受注No.}"
    ],
    "answer": 2,
    "explanation": "受注No.だけでは同じ受注の複数商品を区別できません。"
  },
  {
    "id": "DB06-29",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "関数従属性",
      "演習"
    ],
    "question": "受注(受注No., 受注日, 顧客コード, 顧客名, 商品コード, 商品名, 単価, 数量)（1回の受注に複数の商品がありうる）で成立する、自明でない関数従属性として正しいものはどれか。",
    "choices": [
      "数量 → 商品名",
      "顧客コード → 顧客名",
      "商品名 → 受注No.",
      "単価 → 商品コード"
    ],
    "answer": 1,
    "explanation": "受注No.→受注日・顧客コード、商品コード→商品名・単価なども成立します。"
  },
  {
    "id": "DB06-30",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "関数従属性",
      "演習"
    ],
    "question": "貸出(貸出コード, 日付, 学生コード, 学生名, 学部, 入学年度) で、学生コード0003と0006がともに「剛田武」で学部が創造工と工である。成立しないFDはどれか。",
    "choices": [
      "学生名 → 学部",
      "学生コード → 学生名",
      "貸出コード → 学生コード",
      "学生コード → 入学年度"
    ],
    "answer": 0,
    "explanation": "同姓同名がいるので学生名から学部は決まりません。"
  },
  {
    "id": "DB06-31",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "UPDATE",
      "演習"
    ],
    "question": "students(id, name, grade, department, faculty, score, result) で、得点(score)が60点以上の学生の合否(result)を「合格」にするSQL文はどれか。",
    "choices": [
      "UPDATE students SET result='合格' WHERE score>60;",
      "UPDATE students SET score='合格' WHERE result>=60;",
      "INSERT INTO students (result) VALUES ('合格');",
      "UPDATE students SET result='合格' WHERE score>=60;"
    ],
    "answer": 3,
    "explanation": "60点以上なので >= です。"
  },
  {
    "id": "DB06-32",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "UPDATE",
      "演習"
    ],
    "question": "students(id, name, grade, department, faculty, score, result) で、X学部(faculty)の学生全員の得点(score)に3点加点するSQL文はどれか。",
    "choices": [
      "UPDATE students SET score+3 WHERE faculty='X学部';",
      "SELECT score+3 FROM students WHERE faculty='X学部';",
      "UPDATE students SET score=score+3 WHERE faculty='X学部';",
      "UPDATE students SET score=3 WHERE faculty='X学部';"
    ],
    "answer": 2,
    "explanation": "SET カラム名=式 で現在値に加算します。"
  },
  {
    "id": "DB06-33",
    "lecture": "第6回 関数従属性と無損失分解",
    "tags": [
      "集約関数",
      "演習"
    ],
    "question": "students(id, name, grade, department, faculty, score, result) で、X学部(faculty)の学生の平均点を計算するSQL文はどれか。",
    "choices": [
      "SELECT score FROM students GROUP BY AVG;",
      "SELECT AVG(score) FROM students WHERE faculty='X学部';",
      "SELECT SUM(score) FROM students WHERE faculty='X学部';",
      "SELECT AVG(faculty) FROM students WHERE score='X学部';"
    ],
    "answer": 1,
    "explanation": "AVGは平均値を求める集約関数です。"
  }
];
