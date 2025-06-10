require('dotenv').config()

export const isProduction =
  process.env.NODE_ENV === 'production' || process.argv[2] === 'production'

export const HOST = isProduction
  ? process.env.PRODUCTION_HOST
  : `http://${process.env.HOST}:${process.env.PORT}`

export function removeAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

export function generateNameId({ name, id }: { name: string; id: string }) {
  const removeSpecialCharacter = (str: string) =>
    str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|-|\{|\}|\||\\/g, '')

  const nameId = removeSpecialCharacter(name)
    .toLowerCase()
    .split(' ')
    .join('-')
  return `${nameId}-i-${id}`
} 
