import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const referencesDir = path.join(root, 'references')
const tmpDir = path.join(referencesDir, '.tmp')

const repos = [
  {
    name: 'wxauto',
    owner: 'cluic',
    repo: 'wxauto',
    branch: 'main',
    source: 'https://github.com/cluic/wxauto',
  },
  {
    name: 'wxauto-http-api',
    owner: 'jingyi0605',
    repo: 'WXAUTO-HTTP-API',
    branch: 'main',
    source: 'https://github.com/jingyi0605/WXAUTO-HTTP-API',
  },
  {
    name: 'wxauto-mgt',
    owner: 'jingyi0605',
    repo: 'WXAUTO-MGT',
    branch: 'main',
    source: 'https://github.com/jingyi0605/WXAUTO-MGT',
  },
  {
    name: 'SiverWXbot_plus',
    owner: 'SiverKing',
    repo: 'SiverWXbot_plus',
    branch: 'master',
    source: 'https://github.com/SiverKing/SiverWXbot_plus',
  },
]

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe', ...options })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} ${args.join(' ')} failed with ${code}\n${stderr || stdout}`))
    })
  })
}

async function download(url, target) {
  await run('curl', ['-L', '--retry', '3', '--retry-delay', '2', '--max-time', '180', '-o', target, url])
}

async function fetchRepo(repo) {
  const zipPath = path.join(tmpDir, `${repo.name}.zip`)
  const extractDir = path.join(tmpDir, repo.name)
  const targetDir = path.join(referencesDir, repo.name)
  const url = `https://codeload.github.com/${repo.owner}/${repo.repo}/zip/refs/heads/${repo.branch}`

  await fs.rm(zipPath, { force: true })
  await fs.rm(extractDir, { recursive: true, force: true })
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(extractDir, { recursive: true })

  await download(url, zipPath)
  await run('unzip', ['-q', zipPath, '-d', extractDir])

  const entries = await fs.readdir(extractDir)
  if (entries.length !== 1) {
    throw new Error(`Unexpected archive layout for ${repo.name}: ${entries.join(', ')}`)
  }

  await fs.rename(path.join(extractDir, entries[0]), targetDir)
  await fs.writeFile(
    path.join(targetDir, '.gewehub-reference.json'),
    `${JSON.stringify({ ...repo, archiveUrl: url, fetchedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  )
  console.log(`Saved ${repo.source} -> references/${repo.name}`)
}

async function main() {
  await fs.mkdir(tmpDir, { recursive: true })
  for (const repo of repos) {
    await fetchRepo(repo)
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
