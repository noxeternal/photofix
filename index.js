const fs = require('fs').promises
const {createReadStream, unlink} = require('fs')
const util = require('util')
const path = require('path')
const crypto = require('crypto')

const BASE = path.join(__dirname, 'test')
const _DEBUG_ = true

async function confirm (dupeFiles) {
  console.log('Files to remove: ', dupeFiles)
  console.log('Delete? \(YN\)')

  const stdin = process.stdin
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')

  stdin.on('data', async (key) => {
    if (key.indexOf('y') == 0 || key.indexOf('Y') == 0) {
      console.log('Removing files...')
      await deDupe(dupeFiles)
    }

    process.exit()
  })
}

async function deDupe (files) {
  if (_DEBUG_) {
    files.forEach(f => console.log(`rm ${path.join(BASE, f)}`))
  } else {
    files.forEach(f => unlink(path.join(BASE, f), err => { if (err) console.error(err) }))
  }
}

async function run () {
  const items = await getInfo(BASE)

  const dupeSizes = await sizeFilter(items)

  const toCheck = items.filter(i => dupeSizes.has(i.size))

  const hashes = await hashDupes(toCheck)

  const dupeFiles = await hashFilter(hashes)

  // console.log(items)
  // console.log(dupeSizes)
  // console.log(toCheck)
  // console.log(hashes)
  // console.log(dupeFiles)

  confirm(dupeFiles)
}

async function getInfo (item, rc = 10) {
  const fin = []
  if (rc <= 0) return fin

  const saneName = path.relative(BASE, item)
  const stats = await fs.stat(item)
  // console.log({item, stat})

  if (stats.isFile()) {
    fin.push({filename: saneName, size: stats.size})
  }

  if (stats.isDirectory()) {
    const subItems = []
    const children = await fs.readdir(item)
    await Promise.all(children.map(async child => {
      const res = await getInfo(path.join(item, child), rc - 1)
      // console.log({saneName, res})
      subItems.push(...res)
    }))
    fin.push(...subItems)
  }

  return fin
}

async function sizeFilter (items) {
  let sizeArr = []
  let dupeSize = new Set()
  items.forEach(item => {
    if (sizeArr.includes(item.size)) {
      dupeSize.add(item.size)
    } else {
      sizeArr.push(item.size)
    }
  })
  return dupeSize
}

function hash (filename) {
  return new Promise((resolve, reject) => {
    const input = createReadStream(path.join(BASE, filename))
    const hash = crypto.createHash('sha256')

    input.on('end', () => resolve(hash.digest('hex')))
    input.on('error', (err) => reject(err))
    hash.on('error', (err) => reject(err))

    input.pipe(hash)
  })
}

async function hashDupes (items) {
  return await Promise.all(items.map(async i => {
    i.hash = await hash(i.filename)
    return i
  }))
}

async function hashFilter (items) {
  const hashArr = []
  const dupeFile = []

  items.forEach(item => {
    if (hashArr.includes(item.hash)) {
      dupeFile.push(item.filename)
    } else {
      hashArr.push(item.hash)
    }
  })

  return dupeFile
}

// confirm()
run().catch(console.error)
