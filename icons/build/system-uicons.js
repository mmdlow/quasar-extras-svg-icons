const packageName = 'system-uicons'
const packagePath = '../../packages/system-uicons'
const distName = 'system-uicons'
const iconSetName = 'System UIcons'
const prefix = 'sui'
const iconPath = 'src/images/icons'
const svgPath = '/*.svg'

// ------------

const glob = require('glob')
const { copySync } = require('fs-extra')
const { resolve, join } = require('path')

const start = new Date()

const skipped = []
const distFolder = resolve(__dirname, `../${ distName }`)
const { defaultNameMapper, extract, writeExports } = require('./utils')

const svgFolder = resolve(__dirname, join(packagePath, iconPath))
const svgFiles = glob.sync(join(svgFolder, svgPath))
const iconNames = new Set()

const svgExports = []
const typeExports = []

const postFilters = [
  {
    from: /M0 0z/g,
    to: 'M0 0z@@fill:none;stroke:none;&&'
  }
]

svgFiles.forEach(file => {
  const name = defaultNameMapper(file, prefix)

  if (iconNames.has(name)) {
    return
  }

  try {
    const { svgDef, typeDef } = extract(file, name, { postFilters })
    svgExports.push(svgDef)
    typeExports.push(typeDef)

    iconNames.add(name)
  }
  catch(err) {
    console.error(err)
    skipped.push(name)
  }
})

// const { version } = require(join(svgFolder, '../package.json'))
const version = '0.0.0'
writeExports(iconSetName, version, distFolder, svgExports, typeExports, skipped)

// copySync(
//   resolve(__dirname, `${ packagePath }/LICENSE`),
//   resolve(__dirname, `../${ distName }/LICENSE.md`)
// )

const end = new Date()

console.log(`${ iconSetName } (count: ${ iconNames.size }) done (${ end - start }ms)`)

process.send && process.send({ distName, iconNames: [...iconNames], time: end - start })
