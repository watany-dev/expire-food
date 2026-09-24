import { daysLeftLabel, itemStatus } from "../domain/status";
import type { Item } from "../domain/schema";

const kindLabel = { best_by: "賞味期限", use_by: "消費期限" } as const;

type ListedItem = Item & { days_left: number };

export const ItemList = (props: { items: ListedItem[]; warnDays: number }) => (
  <>
    <header>
      <h1>期限メモ</h1>
      <a href="/settings">設定</a>
    </header>
    <p>
      <a class="button" href="/items/new">
        ＋ 追加
      </a>
    </p>
    {props.items.length === 0 ? (
      <p>まだ登録がありません。</p>
    ) : (
      <ul class="items">
        {props.items.map((item) => (
          <li class={`item ${itemStatus(item.days_left, props.warnDays)}`}>
            <a class="name" href={`/items/${item.id}/edit`}>
              {item.name}
            </a>
            <span class="meta">
              {kindLabel[item.kind]} {item.expires_on}
            </span>
            <span class="days">{daysLeftLabel(item.days_left)}</span>
            <button class="delete secondary" type="button" popovertarget={`delete-${item.id}`}>
              削除
            </button>
            {/* popover 属性で JS なしに確認ダイアログを出す（要件 4.3） */}
            <div popover="auto" id={`delete-${item.id}`}>
              <p>「{item.name}」を削除しますか？</p>
              <form class="actions" method="post" action={`/items/${item.id}/delete`}>
                <button class="danger">削除する</button>
                <button
                  class="secondary"
                  type="button"
                  popovertarget={`delete-${item.id}`}
                  popovertargetaction="hide"
                >
                  やめる
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    )}
  </>
);

type ItemFormValues = Partial<Record<"name" | "expires_on" | "kind" | "memo", string>>;
export type ItemField = keyof ItemFormValues;

const errorMessages: Record<ItemField, string> = {
  name: "商品名を 100 文字以内で入力してください",
  expires_on: "期限日を正しく入力してください",
  kind: "種別を選んでください",
  memo: "メモは 500 文字以内で入力してください",
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
}) => {
  const { values, errors } = props;
  const invalid = (field: ItemField) =>
    errors.has(field) ? { "aria-invalid": true, "aria-describedby": `${field}-error` } : {};
  return (
    <>
      <h1>{props.title}</h1>
      <form method="post" action={props.action}>
        <p>
          <label for="name">商品名</label>
          <input
            id="name"
            name="name"
            required
            maxlength={100}
            value={values.name}
            {...invalid("name")}
          />
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
        <p>
          <label for="memo">メモ（任意）</label>
          <textarea id="memo" name="memo" maxlength={500} rows={3} {...invalid("memo")}>
            {values.memo}
          </textarea>
          <FieldError field="memo" errors={errors} />
        </p>
        <p class="actions">
          <button>保存</button>
          <a class="button secondary" href="/">
            戻る
          </a>
        </p>
      </form>
    </>
  );
};

export const Settings = (props: { warnDays: string; invalid: boolean }) => (
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
