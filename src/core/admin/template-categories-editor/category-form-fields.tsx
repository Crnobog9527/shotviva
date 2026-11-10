'use client'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'
import { CARD_STYLES, CATEGORY_LIMITS } from '@/core/templates/categories'

import { CATEGORIES_COPY } from './copy'
import type { CategoryFormValues } from './category-form-state'

const COPY = CATEGORIES_COPY.form

type Props = { values: CategoryFormValues; isNew: boolean; onChange: (patch: Partial<CategoryFormValues>) => void }

function Text(props: { id: string; label: string; value: string; max: number; hint?: string; disabled?: boolean; mono?: boolean; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        value={props.value}
        maxLength={props.max}
        disabled={props.disabled}
        className={props.mono ? 'font-mono' : undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
    </div>
  )
}

function Intro({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground" aria-live="polite">
          {value.length} / {CATEGORY_LIMITS.intro}
        </span>
      </div>
      <Textarea id={id} className="min-h-16" value={value} maxLength={CATEGORY_LIMITS.intro} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function StyleChoice({ value, onChange }: { value: CategoryFormValues['cardStyle']; onChange: (value: CategoryFormValues['cardStyle']) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{COPY.style}</legend>
      {CARD_STYLES.map((style) => (
        <label key={style} className="flex items-start gap-2 text-sm">
          <input type="radio" name="category-style" className="mt-1 accent-primary" checked={value === style} onChange={() => onChange(style)} />
          <span>
            {CATEGORIES_COPY.style[style]}
            <span className="block text-xs text-muted-foreground">{COPY.styleHint[style]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

// The fields of one category: both names, the key (only while creating), both intros and the
// card style.
export function CategoryFormFields({ values, isNew, onChange }: Props) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Text id="cat-name-zh" label={COPY.nameZh} value={values.nameZh} max={CATEGORY_LIMITS.nameZh} onChange={(nameZh) => onChange({ nameZh })} />
        <Text id="cat-name-en" label={COPY.nameEn} value={values.nameEn} max={CATEGORY_LIMITS.nameEn} onChange={(nameEn) => onChange({ nameEn })} />
      </div>
      <Text
        id="cat-key"
        label={COPY.key}
        value={values.key}
        max={CATEGORY_LIMITS.key}
        mono
        disabled={!isNew}
        hint={isNew ? COPY.keyHint : COPY.keyFixed}
        onChange={(key) => onChange({ key })}
      />
      <Text id="cat-slug" label={COPY.slug} value={values.slug} max={CATEGORY_LIMITS.key} mono onChange={(slug) => onChange({ slug })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.isVisible} onChange={event => onChange({ isVisible: event.target.checked })} />
        {COPY.visible}
      </label>
      <details className="rounded border p-2 text-sm">
        <summary className="cursor-pointer">{COPY.seo}</summary>
        <div className="mt-3 grid gap-3">
          {(['seoTitleZh', 'seoTitleEn', 'seoDescriptionZh', 'seoDescriptionEn'] as const).map(field =>
            <Text key={field} id={field} label={COPY[field]} value={values[field]}
              max={field.startsWith('seoTitle') ? 200 : 500} onChange={value => onChange({ [field]: value })} />)}
        </div>
      </details>
      <Intro id="cat-intro-zh" label={COPY.introZh} value={values.introZh} onChange={(introZh) => onChange({ introZh })} />
      <Intro id="cat-intro-en" label={COPY.introEn} value={values.introEn} onChange={(introEn) => onChange({ introEn })} />
      <p className="-mt-2 text-xs text-muted-foreground">{COPY.introHint}</p>
      <StyleChoice value={values.cardStyle} onChange={(cardStyle) => onChange({ cardStyle })} />
    </div>
  )
}
