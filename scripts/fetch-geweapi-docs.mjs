import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const outputRoot = path.join(root, 'references', 'geweapi-docs')
const baseUrl = 'https://doc.geweapi.com'

const moduleNames = {
  Webhook: '01-Webhook',
  '账号与风控': '03-账号与风控',
  登录模块: '01-登录模块',
  联系人模块: '02-联系人模块',
  群模块: '03-群模块',
  消息模块: '04-消息模块',
  下载: '下载',
  朋友圈模块: '05-朋友圈模块',
  标签模块: '06-标签模块',
  个人模块: '07-个人模块',
  收藏夹模块: '08-收藏夹模块',
  视频号模块: '09-视频号模块',
  账号管理: '10-账号管理',
}

function normalizeName(value) {
  return value
    .replace(/[⭐]/g, '')
    .replace(/[“”"'`]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseIndex(markdown) {
  const items = []
  let section = ''
  for (const line of markdown.split(/\r?\n/)) {
    const sectionMatch = line.match(/^##\s+(.+)$/)
    if (sectionMatch) {
      section = sectionMatch[1].trim()
      continue
    }

    const match = line.match(/^-\s*(.*?)\s*\[([^\]]+)\]\((https:\/\/doc\.geweapi\.com\/[^)]+)\):?/)
    if (!match) continue

    const prefix = match[1].trim()
    const title = match[2].trim()
    const url = match[3].replace(/\.md$/, '')
    const id = path.basename(new URL(url).pathname)
    const parts = prefix
      .split('>')
      .map((part) => part.trim())
      .filter(Boolean)

    items.push({ section, prefix, parts, title, url, id })
  }
  return items
}

function directoryFor(item) {
  if (item.section === 'Docs') {
    if (item.parts.includes('Webhook')) return ['00-基础文档', '01-Webhook']
    if (item.parts.includes('账号与风控')) return ['00-基础文档', '03-账号与风控']
    return ['00-基础文档', '00-入门与介绍']
  }

  const apiParts = item.parts.filter((part) => part !== 'API 参考')
  if (apiParts.length === 0) return ['02-API参考']

  return [
    '02-API参考',
    ...apiParts.map((part) => moduleNames[part] || normalizeName(part)),
  ]
}

function filenameFor(item, indexInDir) {
  const title = normalizeName(item.title)
  const order = String(indexInDir).padStart(2, '0')
  return `${order}-${title}.md`
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/markdown,text/plain,text/html;q=0.9,*/*;q=0.8',
      'user-agent': 'GeWeHub-docs-mirror/1.0',
    },
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return await response.text()
}

async function writeReadme(items, generatedAt) {
  const byTopDir = new Map()
  for (const item of items) {
    const top = item.localPath.split('/')[0]
    byTopDir.set(top, (byTopDir.get(top) || 0) + 1)
  }

  const lines = [
    '# GeWeAPI 官方文档镜像',
    '',
    `生成时间: ${generatedAt}`,
    '',
    '来源: https://doc.geweapi.com/',
    '',
    '本目录用于为 GeWeHub 开发提供稳定的 GeWeAPI 离线文档参考。文件按官方文档模块整理，文件名使用可读中文标题。',
    '',
    '## 目录',
    '',
    ...[...byTopDir.entries()].map(([dir, count]) => `- \`${dir}/\`: ${count} 个文档`),
    '',
    '## 说明',
    '',
    '- `llms.txt`: 官方 LLM 索引原文。',
    '- `sitemap.xml`: 官方 sitemap 原文。',
    '- `source-map.json`: 本地文件与官方 URL 的映射。',
    '- `*.md`: 从官方 `.md` 路由保存的正文或 OpenAPI 片段。',
    '',
    '如果官方文档变化，重新运行 `node scripts/fetch-geweapi-docs.mjs` 刷新本目录。',
    '',
  ]

  await fs.writeFile(path.join(outputRoot, 'README.md'), lines.join('\n'), 'utf8')
}

async function main() {
  await fs.rm(outputRoot, { recursive: true, force: true })
  await fs.mkdir(outputRoot, { recursive: true })

  const generatedAt = new Date().toISOString()
  const llms = await fetchText(`${baseUrl}/llms.txt`)
  const sitemap = await fetchText(`${baseUrl}/sitemap.xml`)
  await fs.writeFile(path.join(outputRoot, 'llms.txt'), llms, 'utf8')
  await fs.writeFile(path.join(outputRoot, 'sitemap.xml'), sitemap, 'utf8')

  const items = parseIndex(llms)
  const counters = new Map()
  const sourceMap = []

  for (const item of items) {
    const dirs = directoryFor(item)
    const dirKey = dirs.join('/')
    const nextIndex = (counters.get(dirKey) || 0) + 1
    counters.set(dirKey, nextIndex)

    const fileName = filenameFor(item, nextIndex)
    const relativePath = [...dirs, fileName].join('/')
    const absolutePath = path.join(outputRoot, ...dirs, fileName)
    const markdownUrl = `${item.url}.md`

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })

    let body = ''
    let status = 'ok'
    let error = null
    try {
      body = await fetchText(markdownUrl)
    } catch (err) {
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
      body = [
        `# ${item.title}`,
        '',
        `> 抓取失败: ${error}`,
        '',
        `官方地址: ${item.url}`,
        `Markdown 地址: ${markdownUrl}`,
        '',
      ].join('\n')
    }

    const frontMatter = [
      '---',
      `title: ${JSON.stringify(item.title)}`,
      `source_url: ${JSON.stringify(item.url)}`,
      `markdown_url: ${JSON.stringify(markdownUrl)}`,
      `source_id: ${JSON.stringify(item.id)}`,
      `section: ${JSON.stringify(item.section)}`,
      `category: ${JSON.stringify(item.parts.join(' > '))}`,
      `fetched_at: ${JSON.stringify(generatedAt)}`,
      `fetch_status: ${JSON.stringify(status)}`,
      '---',
      '',
    ].join('\n')

    await fs.writeFile(absolutePath, `${frontMatter}${body.trim()}\n`, 'utf8')

    sourceMap.push({
      title: item.title,
      section: item.section,
      category: item.parts,
      sourceId: item.id,
      sourceUrl: item.url,
      markdownUrl,
      localPath: relativePath,
      status,
      error,
    })
  }

  await fs.writeFile(
    path.join(outputRoot, 'source-map.json'),
    `${JSON.stringify({ generatedAt, source: baseUrl, total: sourceMap.length, items: sourceMap }, null, 2)}\n`,
    'utf8'
  )
  await writeReadme(sourceMap, generatedAt)

  const failed = sourceMap.filter((item) => item.status !== 'ok')
  console.log(`Saved ${sourceMap.length} GeWeAPI docs to ${outputRoot}`)
  if (failed.length > 0) {
    console.log(`Failed ${failed.length} docs:`)
    for (const item of failed) console.log(`- ${item.title}: ${item.error}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
