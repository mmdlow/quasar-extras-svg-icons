const packageName = 'WindowsIcons'
const packagePath = '../../packages/WindowsIcons'
const distName = 'windows-icons'
const iconSetName = 'Windows Icons'
const prefix = ''
const iconPath = '/WindowsPhone/svg'
const svgPath = '/*.svg'

// ------------

const glob = require('glob')
const { writeFileSync } = require('fs')
const { copySync } = require('fs-extra')
const { resolve, join } = require('path')

const start = new Date()

const skipped = []
const distFolder = resolve(__dirname, `../${ distName }`)
const { defaultNameMapper, extract, writeExports } = require('./utils')

const svgFolder = resolve(__dirname, join(packagePath, iconPath))
const svgFiles = glob.sync(svgFolder + svgPath)
const iconNames = new Set()

const svgExports = []
const typeExports = []

const stylesFilter = [
  {
    from: 'fill:#000000;',
    to: 'fill:currentColor;'
  },
  {
    from: 'fill-opacity:1;', // opacity at 1 is redundant
    to: ''
  }
]

// we are doing this because it makes each svg icon
// 6 characters shorter. And, we are dealing with
// 1260 icons. That's a saving of 7560 bytes in the
// output file.
function viewBoxFilter (viewBox) {
  const parts = viewBox.split(' ')
  const box = []
  parts.forEach(part => {
    box.push(parseInt(part, 10))
  })
  viewBox = box.join(' ')
  return viewBox
}

// This filter removes an additional 1260 unnecessary bytes
const postFilters = [
  {
    from: /^M /, // Just the initial 'M ', remove the space
    to: 'M'
  }
]

svgFiles.forEach(file => {
  const name = defaultNameMapper(file, prefix)

  if (iconNames.has(name)) {
    return
  }

  try {
    const { svgDef, typeDef } = extract(file, name, { stylesFilter, viewBoxFilter, postFilters })
    svgExports.push(svgDef)
    typeExports.push(typeDef)

    iconNames.add(name)
  }
  catch(err) {
    console.error(err)
    skipped.push(name)
  }
})

// const { version } = require(join(packagePath, 'package.json'))
const version = '0.0.0'
writeExports(iconSetName, version, distFolder, svgExports, typeExports, skipped)

// copySync(
//   resolve(__dirname, `${ packagePath }/LICENSE.md`),
//   resolve(__dirname, `../${ distName }/LICENSE.md`)
// )

// write the JSON file
const file = resolve(__dirname, join('..', distName, 'icons.json'))
writeFileSync(file, JSON.stringify([...iconNames].sort(), null, 2), 'utf-8')

const end = new Date()

console.log(`${ iconSetName } (count: ${ iconNames.size }) done (${ end - start }ms)`)

process.send && process.send({ distName, iconNames: [...iconNames], time: end - start })
