import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { TypedLexMap } from '@atproto/lex-data'
import type { RecordKeyString } from '@atproto/syntax'
import { validateRecord } from '../src/repo/prepare.js'

const createdAt = '2026-08-15T12:00:00.000Z'
const creatorDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'

const validate = (record: Record<string, unknown>) =>
  validateRecord(record as TypedLexMap, 'beta' as RecordKeyString, {
    validate: true,
  })

const canonicalizeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalizeJson(item)]),
  )
}

const canonicalJsonSha256 = (path: string) => {
  const schema = JSON.parse(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
  )
  // Match `jq -cS`: recursively sorted compact JSON plus one trailing newline.
  const canonical = `${JSON.stringify(canonicalizeJson(schema))}\n`
  return createHash('sha256').update(canonical).digest('hex')
}

// Computed from the reviewed ATM staging PR #371 head
// 519a4aa511d87702dc18c0f3ab55663cc13f224b.
const reviewedSchemaHashes = [
  {
    path: '../../../lexicons/money/atmosphere/product.json',
    sha256: '3435cfacebce24e1c7a67e6415d4c6e44bc0dcb9bfa3daeaf93c1a4ee08e7464',
  },
  {
    path: '../../../lexicons/money/atmosphere/price.json',
    sha256: 'de0c578db67e0c5f7e02b15717c6d444d1d8efda756fd4f81f3391646ba4e520',
  },
  {
    path: '../../../lexicons/money/atmosphere/membership/program.json',
    sha256: '2b0e3f2267b2d9b963bfde88ae1680241d7ea74fd6bca41d7ccf0529752aaa0e',
  },
  {
    path: '../../../lexicons/money/atmosphere/membership/tier.json',
    sha256: '5f49dc4265c4e463c2e8e3c91b4881795682fcbe61ee77c81a84b0c93987a495',
  },
]

describe('ATM stable membership catalog lexicons', () => {
  it('matches all reviewed ATM staging schema semantics', () => {
    for (const schema of reviewedSchemaHashes) {
      expect(canonicalJsonSha256(schema.path)).toBe(schema.sha256)
    }
  })

  const validRecords = [
    {
      $type: 'money.atmosphere.product',
      title: 'Membership',
      kind: 'membership',
      sourceGeneration: 7,
      createdAt,
      updatedAt: createdAt,
    },
    {
      $type: 'money.atmosphere.price',
      offerUri: `at://${creatorDid}/money.atmosphere.product/membership`,
      currency: 'usd',
      unitAmount: 500,
      type: 'recurring',
      recurring: { interval: 'month' },
      sourceGeneration: 7,
      createdAt,
      updatedAt: createdAt,
    },
    {
      $type: 'money.atmosphere.membership.program',
      title: 'Creator membership',
      scope: 'creator-wide',
      sourceGeneration: 7,
      createdAt,
      updatedAt: createdAt,
    },
    {
      $type: 'money.atmosphere.membership.tier',
      program: `at://${creatorDid}/money.atmosphere.membership.program/main`,
      title: 'Member',
      sourceGeneration: 7,
      createdAt,
      updatedAt: createdAt,
    },
  ]

  it.each(validRecords)('validates $type with sourceGeneration', (record) => {
    expect(validate(record)).toBe('valid')
  })

  it.each(validRecords)(
    'rejects a negative sourceGeneration for $type',
    (record) => {
      expect(() => validate({ ...record, sourceGeneration: -1 })).toThrow(
        /sourceGeneration/,
      )
    },
  )

  it('rejects a strongRef where membership.tier requires a program AT-URI', () => {
    expect(() =>
      validate({
        ...validRecords[3],
        program: {
          $type: 'com.atproto.repo.strongRef',
          uri: `at://${creatorDid}/money.atmosphere.membership.program/main`,
          cid: 'bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      }),
    ).toThrow(/program/)
  })

  it('continues to reject an unrelated unknown collection', () => {
    expect(() =>
      validate({
        $type: 'money.atmosphere.membership.notReviewed',
        createdAt,
      }),
    ).toThrow(/Unknown lexicon type/)
  })
})
