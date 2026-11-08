'use client'

import { useFormatter } from 'next-intl'
import type { ReactNode } from 'react'

import { INQUIRY_NEEDS, INQUIRY_PLATFORMS, INQUIRY_USES, LIMITS, MONTHLY_VOLUMES, START_TIMES, TEAM_SIZES } from '../rules'
import { charCount, type InquiryField, type InquiryValues } from '../validate'
import { ChoiceField } from './choice-field'
import type { InquiryCopy } from './copy'
import { TextField, type TextFieldProps } from './text-field'
import type { InquiryForm } from './use-inquiry-form'

type SectionProps = { form: InquiryForm; copy: InquiryCopy }

type TextKey = 'name' | 'email' | 'jobTitle' | 'phone' | 'wechat' | 'company' | 'website' | 'country' | 'message'

// A section of the form: a heading over a hairline, then its fields.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-headline font-semibold tracking-[-0.01em]">{title}</h3>
      {children}
    </section>
  )
}

// The props every field takes from the form: value, error, change and blur, by field name.
function textFields(form: InquiryForm, copy: InquiryCopy) {
  return (key: TextKey, optional: boolean, max: number, input?: TextFieldProps['input']): TextFieldProps => {
    const error = form.errors[key]
    return {
      id: `iq-${key}`,
      label: copy.fields[key].label,
      placeholder: copy.fields[key].placeholder,
      hint: copy.fields[key].hint,
      optional: optional ? copy.optional : undefined,
      value: form.values[key],
      error: error ? copy.errors[error] : null,
      maxLength: max,
      input,
      onChange: (value) => form.set(key, value),
      onBlur: () => form.leave(key),
    }
  }
}

function errorOf(form: InquiryForm, copy: InquiryCopy, field: InquiryField): string | null {
  const error = form.errors[field]
  return error ? copy.errors[error] : null
}

export function ContactSection({ form, copy }: SectionProps) {
  const text = textFields(form, copy)
  return (
    <Section title={copy.sections.contact}>
      <div className="grid gap-5 md:grid-cols-2 md:gap-x-4">
        <TextField {...text('name', false, LIMITS.name, { autoComplete: 'name' })} />
        <TextField {...text('email', false, LIMITS.email, { type: 'email', autoComplete: 'email', inputMode: 'email' })} />
        <TextField {...text('jobTitle', true, LIMITS.jobTitle, { autoComplete: 'organization-title' })} />
        <TextField {...text('phone', true, LIMITS.phone, { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })} />
        <TextField {...text('wechat', true, LIMITS.wechat, { autoComplete: 'off' })} />
      </div>
    </Section>
  )
}

export function CompanySection({ form, copy }: SectionProps) {
  const text = textFields(form, copy)
  const pick = <K extends 'teamSize' | 'platforms'>(key: K, value: InquiryValues[K]) => form.set(key, value)
  return (
    <Section title={copy.sections.company}>
      <div className="grid gap-5 md:grid-cols-2 md:gap-x-4">
        <TextField {...text('company', false, LIMITS.company, { autoComplete: 'organization' })} />
        <TextField {...text('website', true, LIMITS.website, { type: 'url', autoComplete: 'url', inputMode: 'url' })} />
        <TextField {...text('country', true, LIMITS.country, { autoComplete: 'country-name' })} />
      </div>
      <ChoiceField id="iq-teamSize" legend={copy.fields.teamSize} optional={copy.optional} options={TEAM_SIZES} labels={copy.choices.teamSize}
        value={form.values.teamSize} onChange={(value) => pick('teamSize', value)} error={null} />
      <ChoiceField id="iq-platforms" multiple legend={copy.fields.platforms} optional={copy.optional} hint={copy.chooseAny} options={INQUIRY_PLATFORMS}
        labels={copy.choices.platforms} value={form.values.platforms} onChange={(value) => pick('platforms', value)} error={null} />
    </Section>
  )
}

export function NeedsSection({ form, copy }: SectionProps) {
  const text = textFields(form, copy)
  const format = useFormatter()
  // A measurement, the same in both languages (DESIGN "The Measurement Mono Rule").
  const counter = `${format.number(charCount(form.values.message.trim()))} / ${format.number(LIMITS.message)}`
  return (
    <Section title={copy.sections.needs}>
      <ChoiceField id="iq-volume" legend={copy.fields.volume} options={MONTHLY_VOLUMES} labels={copy.choices.volume}
        value={form.values.volume} onChange={(value) => form.set('volume', value)} error={errorOf(form, copy, 'volume')} />
      <ChoiceField id="iq-uses" multiple legend={copy.fields.uses} hint={copy.chooseAny} options={INQUIRY_USES} labels={copy.choices.uses}
        value={form.values.uses} onChange={(value) => form.set('uses', value)} error={errorOf(form, copy, 'uses')} />
      <ChoiceField id="iq-needs" multiple legend={copy.fields.needs} optional={copy.optional} hint={copy.chooseAny} options={INQUIRY_NEEDS}
        labels={copy.choices.needs} value={form.values.needs} onChange={(value) => form.set('needs', value)} error={null} />
      <ChoiceField id="iq-startTime" legend={copy.fields.startTime} optional={copy.optional} options={START_TIMES} labels={copy.choices.startTime}
        value={form.values.startTime} onChange={(value) => form.set('startTime', value)} error={null} />
      <TextField {...text('message', false, LIMITS.message)} counter={counter} />
    </Section>
  )
}
