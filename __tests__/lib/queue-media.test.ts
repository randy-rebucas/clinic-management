import { describe, it, expect } from 'vitest';
import { AD_EVERY, AD_IMAGE_URL, adAtTick, youtubeEmbedUrl, youtubeId, spokenCall, waitText } from '@/lib/queue-media';

const ID = 'dQw4w9WgXcQ';

describe('youtubeId', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}&t=30s`],
    [`https://youtube.com/watch?list=PL1&v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}?si=abc`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`youtube.com/watch?v=${ID}`],
    [`  ${ID}  `],
  ])('reads %s', (link) => {
    expect(youtubeId(link)).toBe(ID);
  });

  it.each([
    [''],
    ['not a link'],
    ['https://evil.example/watch?v=dQw4w9WgXcQ'],
    ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=short'],
    ['https://www.youtube.com/playlist?list=PL123'],
  ])('refuses %s', (link) => {
    expect(youtubeId(link)).toBeNull();
  });
});

describe('youtubeEmbedUrl', () => {
  it('loops the whole list, muted, from the no-cookie host', () => {
    const url = new URL(youtubeEmbedUrl([ID, 'abcdefghijk']));
    expect(url.origin + url.pathname).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    expect(url.searchParams.get('playlist')).toBe(`${ID},abcdefghijk`);
    expect(url.searchParams.get('mute')).toBe('1');
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('loop')).toBe('1');
  });

  it('lets the screen control the sound', () => {
    expect(new URL(youtubeEmbedUrl([ID])).searchParams.get('enablejsapi')).toBe('1');
  });
});

describe('AD_IMAGE_URL', () => {
  it('takes only images on Cloudinary', () => {
    expect(AD_IMAGE_URL.test('https://res.cloudinary.com/demo/image/upload/v1/ads/a.jpg')).toBe(true);
    expect(AD_IMAGE_URL.test('http://res.cloudinary.com/demo/image/upload/a.jpg')).toBe(false);
    expect(AD_IMAGE_URL.test('https://evil.example/image/upload/a.jpg')).toBe(false);
    expect(AD_IMAGE_URL.test('https://res.cloudinary.com/demo/raw/upload/a.html')).toBe(false);
  });
});

describe('adAtTick', () => {
  it('shows nothing without ads', () => {
    expect(adAtTick(5, 0, true)).toBeNull();
  });

  it('rotates straight through when there are no videos', () => {
    expect([0, 1, 2, 3].map((t) => adAtTick(t, 3, false))).toEqual([0, 1, 2, 0]);
  });

  it('gives the video the screen between ads, moving to the next ad each time', () => {
    const ticks = Array.from({ length: AD_EVERY * 3 }, (_, t) => adAtTick(t, 2, true));
    expect(ticks.filter((a) => a !== null)).toEqual([0, 1, 0]);
    expect(ticks.slice(0, AD_EVERY - 1).every((a) => a === null)).toBe(true);
  });
});

describe('spokenCall', () => {
  it('reads the number out and never a name', () => {
    expect(spokenCall({ number: 'W-052', room: null })).toBe('Now serving W 0 5 2');
  });

  it('says where to go, adding "room" to a bare number', () => {
    expect(spokenCall({ number: 'A-007', room: 'Room 2' })).toBe('Now serving A 0 0 7, please go to Room 2');
    expect(spokenCall({ number: 'A-007', room: '7' })).toBe('Now serving A 0 0 7, please go to room 7');
  });
});

describe('waitText', () => {
  it('says next instead of zero minutes', () => {
    expect(waitText(0)).toBe('Next');
    expect(waitText(15)).toBe('~15 min');
  });
});
