// 店铺信息 (ARCHITECTURE §5.3「每周复用」). Pure parts; the server reads and writes are in './store'.
export { contactLine, EMPTY_STORE, STORE_LIMITS, storeIsEmpty, storeTextSchema, type StoreActions, type StoreFill, type StoreProfile, type StoreQr, type StoreSave, type StoreText } from './profile'
export { copyConflicts, fillCopy, fillPoster, matchesStore, POSTER_STORE_PATHS, storeCopyValues } from './fill'
