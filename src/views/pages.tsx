import { shortDate } from "../domain/date";
import { daysLeftLabel, groupByDeadline, itemStatus } from "../domain/status";
import type { Item, Tag } from "../domain/schema";

const kindLabel = { best_by: "賞味期限", use_by: "消費期限" } as const;
const kindShort = { best_by: "賞味", use_by: "消費" } as const;

const LATER_VISIBLE = 2;

type ListedItem = Item & { days_left: number };

// popover 属性で JS なしに確認ダイアログを出す（要件 4.3）
const ConfirmDelete = (props: { id: string; message: string; action: string }) => (
  <div popover="auto" id={props.id}>
    <p>{props.message}</p>
    <form class="actions" method="post" action={props.action}>
      <button class="danger">削除する</button>
      <button class="secondary" type="button" popovertarget={props.id} popovertargetaction="hide">
        やめる
      </button>
    </form>
  </div>
);

export const ItemList = (props: {
  items: ListedItem[];
  tags: Tag[];
  tag: Tag | undefined;
  warnDays: number;
  today: string;
  lostSpace: boolean;
  deleted: string | undefined;
}) => {
  // 絞り込み中は全件が同じタグなので出さない
  const tagNames = new Map(props.tag ? [] : props.tags.map((tag) => [tag.id, tag.name]));
  const row = (item: ListedItem) => (
    <li
      id={`item-${item.id}`}
      class={`item ${itemStatus(item.days_left, props.warnDays, item.kind)}`}
    >
      {/* 左にスワイプすると削除ボタンが出る。横スクロールと scroll-snap だけで作り、JS は使わない（ADR 0009） */}
      <div class="swipe">
        <a class="row" href={`/items/${item.id}/edit`}>
          <span class="name">{item.name}</span>
          <span class="meta">
            {item.tag_id && tagNames.has(item.tag_id) ? (
              <span class="tag">{tagNames.get(item.tag_id)}</span>
            ) : null}
            {/* 色だけに頼らず、どちらの期限切れかを文言でも示す */}
            {item.days_left < 0 ? `${kindLabel[item.kind]}切れ` : kindShort[item.kind]}{" "}
            {shortDate(item.expires_on, props.today)}
          </span>
          <span class="days">{daysLeftLabel(item.days_left)}</span>
        </a>
        <button class="delete danger" type="button" popovertarget={`delete-${item.id}`}>
          削除
        </button>
      </div>
      <ConfirmDelete
        id={`delete-${item.id}`}
        message={`「${item.name}」を削除しますか？`}
        action={`/items/${item.id}/delete`}
      />
    </li>
  );
  return (
    <>
      <header>
        <div class="title">
          <button
            class="menu secondary"
            type="button"
            popovertarget="tag-menu"
            aria-label="タグで絞り込む"
          >
            ☰
          </button>
          <h1>{props.tag?.name ?? "期限メモ"}</h1>
        </div>
        <nav>
          <a class="button" href={props.tag ? `/items/new?tag=${props.tag.id}` : "/items/new"}>
            ＋ 追加
          </a>
          <a href="/settings">設定</a>
        </nav>
      </header>
      {/* popover で JS なしに開く（ADR 0011） */}
      <nav popover="auto" id="tag-menu" aria-label="タグ">
        <ul>
          <li>
            <a href="/" aria-current={props.tag ? undefined : "page"}>
              すべて
            </a>
          </li>
          {props.tags.map((tag) => (
            <li>
              <a
                href={`/?tag=${tag.id}`}
                aria-current={tag.id === props.tag?.id ? "page" : undefined}
              >
                {tag.name}
              </a>
            </li>
          ))}
        </ul>
        <a class="button secondary" href="/tags">
          タグを編集
        </a>
      </nav>
      {props.lostSpace ? (
        <p class="notice" role="alert">
          この端末で使っていた一覧が見つかりません。共有URLが作り直された可能性があります。共有している人から新しい共有URLを受け取って開いてください（このまま追加すると別の新しい一覧になります）。
        </p>
      ) : null}
      {props.deleted === undefined ? null : (
        <p class="notice" role="status">
          「{props.deleted}」を削除しました。
        </p>
      )}
      {props.items.length === 0 ? (
        <p>{props.tag ? `「${props.tag.name}」の商品はありません。` : "まだ登録がありません。"}</p>
      ) : (
        groupByDeadline(props.items, props.warnDays).map((group) => {
          const shown = group.key === "later" ? group.items.slice(0, LATER_VISIBLE) : group.items;
          const rest = group.items.slice(shown.length);
          return (
            <section>
              <h2 class="group">
                <span>{group.label}</span>
                <span>{group.items.length}件</span>
              </h2>
              <ul class="items">{shown.map(row)}</ul>
              {rest.length > 0 ? (
                <details>
                  <summary>残り {rest.length} 件を表示</summary>
                  <ul class="items">{rest.map(row)}</ul>
                </details>
              ) : null}
            </section>
          );
        })
      )}
    </>
  );
};

type ItemFormValues = Partial<Record<"name" | "expires_on" | "kind" | "memo" | "tag_id", string>>;
export type ItemField = keyof ItemFormValues;

const errorMessages: Record<ItemField, string> = {
  name: "商品名を 100 文字以内で入力してください",
  expires_on: "期限日を正しく入力してください",
  kind: "種別を選んでください",
  memo: "メモは 500 文字以内で入力してください",
  tag_id: "タグを選び直してください",
};

const FieldError = (props: { field: ItemField; errors: ReadonlySet<ItemField> }) =>
  props.errors.has(props.field) ? (
    <span class="error" id={`${props.field}-error`}>
      {errorMessages[props.field]}
    </span>
  ) : null;

export const ItemForm = (props: {
  title: string;
  action: string;
  values: ItemFormValues;
  errors: ReadonlySet<ItemField>;
  tags: Tag[];
  addNext?: boolean;
  deleteAction?: string;
}) => {
  const { values, errors } = props;
  const invalid = (field: ItemField) =>
    errors.has(field) ? { "aria-invalid": true, "aria-describedby": `${field}-error` } : {};
  return (
    <>
      <h1>{props.title}</h1>
      <form method="post" action={props.action}>
        {/* /extract.js が表示する。JS が無ければ手入力だけ（ADR 0003） */}
        {/* 入力は見た目だけ隠し、大きなラベルのタップでカメラを起動する（フォーカスは入力が受ける） */}
        <p id="photo" hidden>
          <input
            id="photo-input"
            class="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
          />
          <label for="photo-input" class="button">
            📷 撮影して読み取る
          </label>
          <span id="photo-status" role="status" />
        </p>
        {/* 期限が読めなかったとき、期限の部分を囲んで再読する（ADR 0007） */}
        <div id="crop" hidden>
          <canvas id="crop-canvas" aria-label="撮った写真。期限の部分を指でなぞって囲む" />
          <p class="actions">
            <button type="button" id="crop-read" disabled>
              囲んだ部分を読み取る
            </button>
            <button type="button" id="crop-cancel" class="secondary">
              やめる
            </button>
          </p>
        </div>
        <p>
          <label for="name">商品名</label>
          <input
            id="name"
            name="name"
            required
            maxlength={100}
            value={values.name}
            list="name-candidates"
            {...invalid("name")}
          />
          {/* 読み取りで商品名を決めきれなかったときの候補（/extract.js が入れる） */}
          <datalist id="name-candidates" />
          <FieldError field="name" errors={errors} />
        </p>
        <p>
          <label for="expires_on">期限日</label>
          <input
            id="expires_on"
            name="expires_on"
            type="date"
            required
            value={values.expires_on}
            {...invalid("expires_on")}
          />
          {/* /app.js が表示し、JST の今日を基準に入れる。JS が無ければピッカーだけ */}
          <span id="date-chips" class="chips" role="group" aria-label="今日から数えて入れる" hidden>
            {(
              [
                ["今日", "0"],
                ["+3日", "3"],
                ["+1週", "7"],
                ["+1か月", "1m"],
              ] as const
            ).map(([label, offset]) => (
              <button class="secondary" type="button" data-offset={offset}>
                {label}
              </button>
            ))}
          </span>
          <FieldError field="expires_on" errors={errors} />
        </p>
        <fieldset {...invalid("kind")}>
          <legend>種別</legend>
          {(["best_by", "use_by"] as const).map((kind) => (
            <label>
              <input
                type="radio"
                name="kind"
                value={kind}
                required
                checked={(values.kind ?? "best_by") === kind}
              />
              {kindLabel[kind]}
            </label>
          ))}
          <FieldError field="kind" errors={errors} />
        </fieldset>
        {props.tags.length > 0 ? (
          <p>
            <label for="tag_id">タグ</label>
            <select id="tag_id" name="tag_id" {...invalid("tag_id")}>
              <option value="">なし</option>
              {props.tags.map((tag) => (
                <option value={tag.id} selected={values.tag_id === tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
            <FieldError field="tag_id" errors={errors} />
          </p>
        ) : null}
        <p>
          <label for="memo">メモ（任意）</label>
          <textarea id="memo" name="memo" maxlength={500} rows={3} {...invalid("memo")}>
            {values.memo}
          </textarea>
          <FieldError field="memo" errors={errors} />
        </p>
        <p class="actions">
          <button>保存</button>
          {props.addNext ? (
            <button class="secondary" name="next" value="1">
              保存して次を追加
            </button>
          ) : null}
          <a class="button secondary" href="/">
            戻る
          </a>
        </p>
      </form>
      {/* スワイプに気づかなくても削除できるようにする。フォームは入れ子にできないので外に置く */}
      {props.deleteAction === undefined ? null : (
        <>
          <p>
            <button class="danger" type="button" popovertarget="delete-item">
              削除
            </button>
          </p>
          <ConfirmDelete
            id="delete-item"
            message={`「${values.name}」を削除しますか？`}
            action={props.deleteAction}
          />
        </>
      )}
      <script src="/extract.js" defer />
    </>
  );
};

export const Settings = (props: {
  warnDays: string;
  invalid: boolean;
  shareUrl: string | undefined;
}) => (
  <>
    <h1>設定</h1>
    <form method="post" action="/settings">
      <p>
        <label for="warn_days">期限間近（黄色）にする日数</label>
        <input
          id="warn_days"
          name="warn_days"
          type="number"
          inputmode="numeric"
          min={1}
          max={30}
          required
          value={props.warnDays}
          {...(props.invalid
            ? { "aria-invalid": true, "aria-describedby": "warn_days-error" }
            : {})}
        />
        {props.invalid ? (
          <span class="error" id="warn_days-error">
            1〜30 の整数で入力してください
          </span>
        ) : null}
      </p>
      <p class="actions">
        <button>保存</button>
        <a class="button secondary" href="/">
          戻る
        </a>
      </p>
    </form>
    <h2>共有URL</h2>
    {props.shareUrl === undefined ? (
      <p>商品を登録すると共有URLが表示されます。</p>
    ) : (
      <ShareUrl url={props.shareUrl} />
    )}
  </>
);

const ShareUrl = (props: { url: string }) => (
  <>
    <p>
      このURLを開いた端末で同じ一覧を使えます（家族との共有・機種変更）。URLを知っている人は誰でも見られるので、共有する相手にだけ送ってください。
    </p>
    <p>
      <label for="share-url">共有URL</label>
      <input id="share-url" readonly value={props.url} />
    </p>
    {/* Clipboard API / Web Share API が使えるときだけ /app.js が表示する。使えなければ URL を長押しでコピーする */}
    <p class="actions">
      <button id="share-copy" type="button" hidden>
        コピー
      </button>
      <button id="share-send" type="button" hidden>
        送る
      </button>
      <span id="share-status" role="status" />
    </p>
    <p>
      <button class="secondary" type="button" popovertarget="rotate">
        共有URLを作り直す
      </button>
    </p>
    <div popover="auto" id="rotate">
      <p>
        今の共有URLは使えなくなり、共有している端末では新しいURLを開き直すまで一覧が見られなくなります。作り直しますか？
      </p>
      <form class="actions" method="post" action="/settings/rotate">
        <button class="danger">作り直す</button>
        <button class="secondary" type="button" popovertarget="rotate" popovertargetaction="hide">
          やめる
        </button>
      </form>
    </div>
  </>
);

export const TagSettings = (props: { tags: Tag[]; name: string; invalid: boolean }) => (
  <>
    <h1>タグ</h1>
    <p>食事・菓子・酒のように商品を分けると、一覧の左上のボタンから絞り込めます。</p>
    {props.tags.length === 0 ? (
      <p>まだタグがありません。</p>
    ) : (
      <ul class="tags">
        {props.tags.map((tag) => (
          <li>
            <span>{tag.name}</span>
            <button class="danger" type="button" popovertarget={`delete-tag-${tag.id}`}>
              削除
            </button>
            <ConfirmDelete
              id={`delete-tag-${tag.id}`}
              message={`「${tag.name}」を削除しますか？付いている商品はタグなしになります。`}
              action={`/tags/${tag.id}/delete`}
            />
          </li>
        ))}
      </ul>
    )}
    <form method="post" action="/tags">
      <p>
        <label for="tag-name">新しいタグ</label>
        <input
          id="tag-name"
          name="name"
          required
          maxlength={20}
          placeholder="例: 食事"
          value={props.name}
          {...(props.invalid ? { "aria-invalid": true, "aria-describedby": "tag-name-error" } : {})}
        />
        {props.invalid ? (
          <span class="error" id="tag-name-error">
            タグ名を 20 文字以内で入力してください
          </span>
        ) : null}
      </p>
      <p class="actions">
        <button>追加</button>
        <a class="button secondary" href="/">
          戻る
        </a>
      </p>
    </form>
  </>
);

export const LimitReached = (props: { message: string; back: string }) => (
  <>
    <h1>登録できません</h1>
    <p>
      {props.message}
      <a href={props.back}>戻る</a>
    </p>
  </>
);

export const OpenSharedSpace = (props: { action: string; switching: boolean }) => (
  <>
    <h1>共有された一覧</h1>
    <p>
      この端末で共有URLの一覧を使います。開いた後に追加・編集した商品は、共有しているすべての端末から見えます。
    </p>
    {props.switching ? (
      <p class="notice" role="alert">
        この端末で使っている今の一覧から切り替わります。今の一覧に戻るにはその共有URLが要るので、先に
        <a href="/settings">設定</a>で控えてください。
      </p>
    ) : null}
    <form class="actions" method="post" action={props.action}>
      <button>この一覧を開く</button>
      <a class="button secondary" href="/">
        やめる
      </a>
    </form>
  </>
);

export const InvalidShareUrl = () => (
  <>
    <h1>共有URLが使えません</h1>
    <p>
      作り直されたか、URLが間違っている可能性があります。共有している人から新しい共有URLを受け取って開いてください。
      <a href="/">一覧へ戻る</a>
    </p>
  </>
);

export const NotFound = () => (
  <>
    <h1>見つかりません</h1>
    <p>
      削除されたか、別のスペースの商品です。<a href="/">一覧へ戻る</a>
    </p>
  </>
);
