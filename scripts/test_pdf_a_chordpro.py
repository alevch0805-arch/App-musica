"""Pruebas del conversor:  python3 -m unittest discover -s scripts -p 'test_*.py'"""
import unittest

from pdf_a_chordpro import Hymn, guess_key, normalize_accidentals, split_chords, syllable_starts, title_case, LOOSE


def syllables(text: str) -> str:
    st = syllable_starts(text)
    return '|'.join(text[a:b] for a, b in zip(st, st[1:] + [len(text)]))


class Conversor(unittest.TestCase):
    def test_silabas(self):
        self.assertEqual(syllables('Jesús nos ha llamado'), 'Je|sús |nos |ha |lla|ma|do')
        self.assertEqual(syllables('Que nuestros pasos'), 'Que |nues|tros |pa|sos')
        self.assertEqual(syllables('aquí tranquilo'), 'a|quí |tran|qui|lo')
        self.assertEqual(syllables('día poeta'), 'dí|a |po|e|ta')
        self.assertEqual(syllables('guerra construir'), 'gue|rra |cons|truir')

    def test_acordes_pegados(self):
        self.assertEqual(split_chords('C#mCmBm'), ['C#m', 'Cm', 'Bm'])
        self.assertEqual(split_chords('F#m.'), ['F#m'])
        self.assertIsNone(split_chords('Hola'))

    def test_titulos(self):
        self.assertEqual(title_case('VIVE CRISTO EN MÍ'), 'Vive Cristo en mí')
        self.assertEqual(title_case('CORO II'), 'Coro II')
        self.assertEqual(title_case('Ya está bien'), 'Ya está bien')

    def test_tono(self):
        h = Hymn(1, 'x', body=['[E]uno [C#m]dos [A]tres [B]cuatro', '[G#7]cinco [C#m]seis [A]siete [B7]ocho', '{c: Final}', '[E]'])
        self.assertEqual(guess_key(h), 'E')
        h = Hymn(2, 'y', body=['[Am]uno [G]dos [F]tres [E7]cuatro', '[Am]fin'])
        self.assertEqual(guess_key(h), 'Am')

    def test_alteraciones_por_coherencia(self):
        warnings = []
        h = Hymn(3, 'z', body=[
            f'[Bb]a [Eb]b [F]c [Bb]d', f'[Eb]e [Bb]f [E]g [F{""}]h',  # E natural suelto en un himno en Si bemol
            f'[Eb]i [F]j [Bb]k [Eb]l', f'[Cb{LOOSE}]m',  # Cb: grafía imposible
        ])
        normalize_accidentals(h, warnings)
        self.assertNotIn('[E]', ''.join(h.body))
        self.assertIn('[C]m', h.body[3])
        self.assertTrue(any('coherencia' in w for w in warnings))
        self.assertFalse(any(LOOSE in line for line in h.body))


if __name__ == '__main__':
    unittest.main()
