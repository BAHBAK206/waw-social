export function greetingKey(date = new Date()): 'home.morning' | 'home.afternoon' | 'home.evening' {
  const h = date.getHours();
  if (h < 12) return 'home.morning';
  if (h < 18) return 'home.afternoon';
  return 'home.evening';
}
