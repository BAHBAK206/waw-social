import { describe, expect, it } from 'vitest';
import { moderateBody, moderateText } from './moderation';

describe('moderation', () => {
  it('keeps normal school text untouched in every language', () => {
    for (const t of [
      'The dog is an animal. Jerk is the rate of change of acceleration.',
      'الكلب حيوان أليف، والحمار يُستخدم في الزراعة',
      'Le cours a du retard, on continue avec le chapitre 3',
      'Un cono tiene una base circular, con un vértice',
      'Moby Dick is a novel',
    ])
      expect(moderateText(t).action).toBe('allow');
  });

  it('masks insults, including disguised spellings', () => {
    const r = moderateText('you are an 1d10t!!');
    expect(r.action).toBe('mask');
    expect(r.text).toBe('you are an 1****!!');
    expect(moderateText('shiiiit').action).toBe('mask');
    expect(moderateText('انت غَبِيّ جداً').text).toBe('انت غ** جداً');
    expect(moderateText('يا حمار').text).toBe('ي* ح***');
    expect(moderateText('ياحمار انت').action).toBe('mask');
    expect(moderateText('quelle merde').text).toBe('quelle m****');
  });

  it('blocks threats, self-harm encouragement and solicitation', () => {
    expect(moderateText('just kill yourself').action).toBe('block');
    expect(moderateText('اقتل نفسك').action).toBe('block');
    expect(moderateText('send nudes pls').action).toBe('block');
    expect(moderateText('te voy a matar').action).toBe('block');
  });

  it('uses the administrator lists', () => {
    expect(moderateText('buy cheapcoin now', { block: ['cheapcoin'] }).action).toBe('block');
    expect(moderateText('this is lame', { mask: ['lame'] }).text).toBe('this is l***');
  });

  it('screens only text fields of a body, nested included', () => {
    const r = moderateBody({ text: 'shit happens', password: 'shit', poll: { options: [{ text: 'idiot' }, { text: 'ok' }] } });
    expect(r.value).toEqual({ text: 's*** happens', password: 'shit', poll: { options: [{ text: 'i****' }, { text: 'ok' }] } });
    expect(r.masked).toBe(true);
    expect(moderateBody({ title: 'kys' }).blocked).toEqual(['kys']);
  });
});
