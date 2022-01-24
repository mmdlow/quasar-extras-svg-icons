const packageName = 'IconPark'
const packagePath = '../../packages/IconPark'
const distName = 'iconpark-icons'
const iconSetName = 'IconPark Icons'
const prefix = 'ip'
const iconPath = '/source'
const svgPath = '/**/*.svg'

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
    from: /black/gi,
    to: 'currentColor'
  },
  {
    from: /fill:#2F88FF/,
    to: 'fill:currentColor;fill-opacity:0.6;'
  },
  {
    from: /fill:#43CCF8/,
    to: 'fill:currentColor;fill-opacity:0.6;'
  },
  {
    from: /stroke:#000000/,
    to: 'stroke:currentColor;'
  }
]

fill="#2F88FF"

svgFiles.forEach(file => {
  const name = defaultNameMapper(file, prefix)

  if (iconNames.has(name)) {
    return
  }

  try {
    // const { svgDef, typeDef } = extract(file, name, { stylesFilter, viewBoxFilter, postFilters })
    const { svgDef, typeDef } = extract(file, name, { stylesFilter })
    // const { svgDef, typeDef } = extract(file, name)
    svgExports.push(svgDef)
    typeExports.push(typeDef)

    iconNames.add(name)
  }
  catch(err) {
    console.error(err)
    skipped.push(name)
  }
})

const { version } = require(join(packagePath, 'package.json'))
writeExports(iconSetName, version, distFolder, svgExports, typeExports, skipped)

copySync(
  resolve(__dirname, `${ packagePath }/LICENSE`),
  resolve(__dirname, `../${ distName }/LICENSE.md`)
)

// write the JSON file
const file = resolve(__dirname, join('..', distName, 'icons.json'))
writeFileSync(file, JSON.stringify([...iconNames].sort(), null, 2), 'utf-8')

const end = new Date()

console.log(`${ iconSetName } (count: ${ iconNames.size }) done (${ end - start }ms)`)

process.send && process.send({ distName, iconNames: [...iconNames], time: end - start })
