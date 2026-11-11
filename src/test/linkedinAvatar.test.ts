import { describe, expect, it } from 'vitest';
import { linkedInProfilePhoto } from '@/lib/linkedinDirect.shared';

describe('connected LinkedIn member avatar', () => {
  it('uses the photo returned for the connected member', () => {
    const picture = 'https://media.licdn.com/dms/image/member-photo?e=123&v=beta';
    expect(linkedInProfilePhoto(picture)).toBe(picture);
  });
  it('keeps the fallback when LinkedIn provides no photo', () => {
    expect(linkedInProfilePhoto(undefined)).toBeNull();
  });
  it('rejects unsafe profile image values', () => {
    expect(linkedInProfilePhoto('javascript:alert(1)')).toBeNull();
    expect(linkedInProfilePhoto('https://user:secret@example.com/photo')).toBeNull();
  });
});