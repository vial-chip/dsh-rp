/** Web-localized copy for shipped presets and declared copy for every other row. */

import { describe, expect, it } from 'vitest'
import { en, presetDisplayText, zh } from '../src/client/locales.ts'
import { presetGuide } from '../src/client/PresetGuideDialog.tsx'

const translate = (bundle: typeof en) => (key: keyof typeof en): string => bundle[key]

describe('preset display copy', () => {
  it('offers Chinese roleplay guidance in both application locales', () => {
    const guide = presetGuide('roleplay', 'system')!
    expect(en[guide.intro]).toBe(zh[guide.intro])
    expect(en[guide.explanation]).toContain('人工编辑只更新面板')
    expect(zh[guide.usage]).toContain('今晚一起做饭吧')
  })
  it.each([
    ['standard', 'presetStandardName', 'presetStandardDescription'],
    ['ptc', 'presetPtcName', 'presetPtcDescription'],
    ['minimal', 'presetMinimalName', 'presetMinimalDescription'],
    ['cordis', 'presetCordisName', 'presetCordisDescription'],
    ['roleplay', 'presetRoleplayName', 'presetRoleplayDescription'],
  ] as const)('localizes the shipped %s preset in English and Chinese', (id, nameKey, descriptionKey) => {
    const preset = { id }

    expect(presetDisplayText(preset, translate(en)))
      .toEqual({ name: en[nameKey], description: en[descriptionKey] })
    expect(presetDisplayText(preset, translate(zh)))
      .toEqual({ name: zh[nameKey], description: zh[descriptionKey] })
  })

  it('keeps declared metadata untranslated for named and unknown presets', () => {
    const fileCopy = { name: '我的标准', description: '团队自己的 preset。' }

    expect(presetDisplayText({ id: 'standard', ...fileCopy }, translate(en)))
      .toEqual(fileCopy)
    expect(presetDisplayText({ id: 'deployment-extra', ...fileCopy }, translate(en)))
      .toEqual(fileCopy)
    expect(presetDisplayText({ id: 'bare' }, translate(en)))
      .toEqual({ name: 'bare' })
  })
})
