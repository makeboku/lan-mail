export function generateRandomAddress(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const length = 12;
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generatePassword(length?: number): string {
  const finalLength = length || Math.floor(Math.random() * 11) + 35;
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < finalLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
