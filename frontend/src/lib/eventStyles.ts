/** Maps an event name to a CSS class suffix used for colour-coding chips. */
export function eventTypeClass(eventName: string) {
  if (eventName.toLowerCase().includes('number')) return 'number'
  if (eventName.toLowerCase().includes('alphabet')) return 'alphabet'
  if (eventName.toLowerCase().includes('color')) return 'color'
  if (eventName.toLowerCase().includes('emoji')) return 'emoji'
  return 'other'
}
