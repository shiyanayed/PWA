import type { AuditResult, SourceCitation } from './types'

const registries: Array<{ tier: 1 | 2 | 3 | 4; score: number; label: string; domains: string[] }> = [
  { tier: 1, score: 99, label: 'Primary archaeological / epigraphic', domains: ['perseus.tufts.edu', 'papyri.info', 'epigraphy.info', 'inscriptions.packhum.org', 'britishmuseum.org', 'baslibrary.org', 'trismegistos.org', 'deadseascrolls.org.il'] },
  { tier: 2, score: 96, label: 'Academic press / peer reviewed', domains: ['cambridge.org', 'oxfordbibliographies.com', 'oup.com', 'jstor.org', 'brill.com', 'degruyter.com', 'harvard.edu', 'yale.edu', 'mohrsiebeck.com', 'uni-muenster.de', 'sbl-site.org'] },
  { tier: 3, score: 93, label: 'Scholarly lexicon / archive', domains: ['stepbible.org', 'blueletterbible.org', 'ccel.org', 'sefaria.org', 'earlychristianwritings.com', 'csntm.org'] },
  { tier: 4, score: 87, label: 'General educational', domains: ['worldhistory.org', 'britannica.com', 'bibleodyssey.org', 'oxfordreference.com'] },
]

const excludedDomains = ['reddit.com', 'quora.com', 'medium.com', 'facebook.com', 'tiktok.com', 'blogspot.com', 'wordpress.com']

function domainMatches(host: string, registered: string): boolean {
  return host === registered || host.endsWith(`.${registered}`)
}

export function auditSource(source: SourceCitation | string, strict = false): AuditResult {
  const url = typeof source === 'string' ? source : source.url
  try {
    const parsed = new URL(url)
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const excluded = excludedDomains.some((entry) => domainMatches(domain, entry))
    if (excluded || !['https:', 'http:'].includes(parsed.protocol)) {
      return { url, domain, score: 0, tier: 5, label: 'Excluded / unverified', accepted: false }
    }

    for (const registry of registries) {
      if (registry.domains.some((entry) => domainMatches(domain, entry))) {
        return {
          url, domain, score: registry.score, tier: registry.tier, label: registry.label,
          accepted: !strict || registry.tier <= 3,
        }
      }
    }
    return { url, domain, score: 40, tier: 0, label: 'Unverified domain', accepted: !strict }
  } catch {
    return { url, domain: 'invalid-url', score: 0, tier: 5, label: 'Invalid URL', accepted: false }
  }
}

export function auditSources(sources: Array<SourceCitation | string>, strict = false) {
  const results = sources.map((source) => auditSource(source, strict))
  const trusted = results.filter((result) => result.tier >= 1 && result.tier <= 3)
  const consensus = trusted.length
    ? Math.round(trusted.reduce((total, result) => total + result.score, 0) / trusted.length)
    : 0
  return {
    results,
    accepted: results.filter((result) => result.accepted),
    consensus,
    primaryCount: results.filter((result) => result.tier === 1).length,
    meetsThreshold: consensus >= 90,
    explanation: 'Trust scores classify source domains, not the truth of an individual claim. Verify the cited passage and its context.',
  }
}
