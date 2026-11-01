"""重建本地音乐与音效：python -X utf8 tools/assets/prepare_game_audio.py [--download]。

需要 numpy 和 FFmpeg（PATH、--ffmpeg，或 imageio_ffmpeg 提供）。
原始下载仅放 output/audio-source；运行时只发布处理后的 ogg/m4a 和审计清单。
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import wave
import zipfile
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'output/audio-source'
DEST = ROOT / 'public/assets/audio'
RATE = 44100
MUSIC = {
    'bgm_menu_piano': ('first_light_particles.wav', 'https://opengameart.org/sites/default/files/first_light_particles_0.wav',
                       'First Light Particles', 'Yoiyami', 'https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track'),
    'bgm_exploration': ('exploration_theme.zip', 'https://opengameart.org/sites/default/files/exploration_theme.zip',
                        'Exploration Theme', 'Cleyton Kauffman', 'https://opengameart.org/content/exploration-theme'),
    'bgm_ruins_piano': ('mystical_piano.wav', 'https://opengameart.org/sites/default/files/Mystical%20Piano.Wav',
                        'Mystical Piano', 'Indieteur', 'https://opengameart.org/content/mystical-piano'),
    'bgm_boss_piano': ('pursuit.mp3', 'https://opengameart.org/sites/default/files/Vicegrip%20of%20Pursuit.mp3',
                       'Pursuit', 'Sudocolon', 'https://opengameart.org/content/pursuit')
}
# 现有 CC0 音效保留其触感，统一削弱尖锐高频、去掉尾部静音与过长混响。
KENNEY = {
    'jump': ('impact-sounds', 'impactSoft_medium_001.ogg', .25),
    'land': ('impact-sounds', 'footstep_concrete_000.ogg', .18),
    'swing': ('rpg-audio', 'knifeSlice.ogg', .28),
    'hit_melee': ('impact-sounds', 'impactPunch_medium_000.ogg', .26),
    'shoot': ('rpg-audio', 'metalClick.ogg', .20),
    'hit_taken': ('impact-sounds', 'impactPunch_heavy_000.ogg', .35),
    'pickup_item': ('interface-sounds', 'drop_001.ogg', .30),
    'checkpoint': ('interface-sounds', 'confirmation_002.ogg', .65),
    'dash': ('rpg-audio', 'cloth1.ogg', .30),
    'clear': ('music-jingles', 'Pizzicato jingles/jingles_PIZZI05.ogg', 2.0),
    'ui_click': ('interface-sounds', 'click_002.ogg', .09),
    'ui_open': ('interface-sounds', 'open_001.ogg', .17),
    'ui_close': ('interface-sounds', 'close_001.ogg', .17),
    'ui_error': ('interface-sounds', 'error_002.ogg', .24),
    'buy': ('rpg-audio', 'handleCoins2.ogg', .35)
}


def run(*args, data=None):
    return subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', *map(str, args)],
                          input=data, capture_output=True, check=True).stdout


def decode(path, channels=2):
    return np.frombuffer(run('-i', path, '-f', 'f32le', '-ac', channels, '-ar', RATE, '-'),
                         dtype='<f4').reshape(-1, channels).copy()


def wav(path, samples):
    pcm = np.round(np.clip(samples, -.999, .999) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(samples.shape[1]); out.setsampwidth(2); out.setframerate(RATE)
        out.writeframes(pcm.tobytes())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(key, path, record, music=False):
    if music:
        # 两遍 EBU R128，保留动态并统一为 -22 LUFS / -3 dBTP，避免曲目间突然变响。
        filters = 'highpass=f=45,lowpass=f=8500'
        stats = subprocess.run([FFMPEG, '-hide_banner', '-i', str(path), '-af',
                                filters + ',loudnorm=I=-22:TP=-3:LRA=11:print_format=json',
                                '-f', 'null', '-'], capture_output=True, check=True).stderr.decode()
        measured, _ = json.JSONDecoder().raw_decode(stats[stats.rindex('{'):])
        norm = ('loudnorm=I=-22:TP=-3:LRA=11:linear=true:'
                f'measured_I={measured["input_i"]}:measured_TP={measured["input_tp"]}:'
                f'measured_LRA={measured["input_lra"]}:measured_thresh={measured["input_thresh"]}:'
                f'offset={measured["target_offset"]}')
        mastered = SOURCE / f'{key}-master.wav'
        run('-y', '-i', path, '-af', filters + ',' + norm, '-ar', RATE, mastered)
        path = mastered
    for ext, codec in [('ogg', ['-c:a', 'libvorbis', '-q:a', '3']), ('m4a', ['-c:a', 'aac', '-b:a', '112k' if music else '80k', '-movflags', '+faststart'])]:
        output = DEST / f'{key}.{ext}'
        run('-y', '-i', path, *codec, '-ar', RATE, '-map_metadata', '-1', output)
        record[ext + '_sha256'] = digest(output)
    data = decode(DEST / f'{key}.ogg')
    record.update(duration=round(len(data) / RATE, 3), peak_dbfs=round(20 * np.log10(max(1e-10, float(np.max(np.abs(data))))), 2),
                  rms_dbfs=round(20 * np.log10(max(1e-10, float(np.sqrt(np.mean(data ** 2))))), 2))
    REPORT[key] = record
    print(key, record['duration'], 'sec', flush=True)


def tone(freq, duration, decay=6):
    t = np.arange(int(duration * RATE)) / RATE
    # 柔和正弦泛音，短起音避免波形不连续的爆音。
    return (np.sin(2 * np.pi * freq * t) + .16 * np.sin(2 * np.pi * freq * 2 * t)) * np.exp(-decay * t / duration) * np.minimum(1, t / .008)


def whoosh(duration, low=False):
    t = np.arange(int(duration * RATE)) / RATE
    noise = RNG.normal(0, 1, len(t))
    noise = np.convolve(noise, np.ones(45 if low else 9) / (45 if low else 9), mode='same')
    return noise * np.sin(np.pi * t / duration) ** 1.6


def layer(*parts):
    out = np.zeros(max(int(at * RATE) + len(signal) for at, signal, _gain in parts))
    for at, signal, gain in parts:
        start = int(at * RATE); out[start:start + len(signal)] += signal * gain
    return out


def chime(notes, duration=.24, step=.075):
    return layer(*[(i * step, tone(freq, duration), .8 ** i) for i, freq in enumerate(notes)])


def prepare_sfx(key, data, source):
    data = data.reshape(-1, 1)
    # 保持头尾平滑；统一峰值 -5 dBFS，最终响度由 audioCatalog 独立分配。
    peak = float(np.max(np.abs(data)))
    if peak > 0: data *= .56 / peak
    edge = min(int(.006 * RATE), len(data) // 3)
    data[:edge] *= np.linspace(0, 1, edge)[:, None]
    data[-edge:] *= np.linspace(1, 0, edge)[:, None]
    path = SOURCE / f'{key}.wav'; wav(path, data)
    filtered = SOURCE / f'{key}-filtered.wav'
    run('-y', '-i', path, '-af', 'highpass=f=70,lowpass=f=5500', filtered)
    encode(key, filtered, source)


def main(download):
    SOURCE.mkdir(parents=True, exist_ok=True); DEST.mkdir(parents=True, exist_ok=True)
    for key, (filename, url, title, author, page) in MUSIC.items():
        path = SOURCE / filename
        if not path.exists():
            if not download: raise FileNotFoundError(f'{path}，使用 --download 获取')
            urlretrieve(url, path)
        original = path
        if path.suffix == '.zip':
            with zipfile.ZipFile(path) as pack:
                name = 'Exploration Theme/Exploration Theme.wav'
                path = SOURCE / 'exploration_theme.wav'; path.write_bytes(pack.read(name))
        data = decode(path)
        if key == 'bgm_ruins_piano': data = data[:95 * RATE]  # 作者指定 1:35 循环点。
        if key == 'bgm_menu_piano':
            # 非循环原曲以 3 秒等功率交叠连接尾音与开头，输出仍为完整长曲。
            n = 3 * RATE; mix = np.linspace(0, 1, n)[:, None]
            seam = data[-n:] * np.cos(mix * np.pi / 2) + data[:n] * np.sin(mix * np.pi / 2)
            data = np.concatenate([data[n:-n], seam])
        # 原生循环保留节拍；极短淡入淡出移除压缩编解码边缘的波形跳变。
        n = int(.008 * RATE)
        data[:n] *= np.linspace(0, 1, n)[:, None]; data[-n:] *= np.linspace(1, 0, n)[:, None]
        prepared = SOURCE / f'{key}.wav'; wav(prepared, data)
        encode(key, prepared, dict(title=title, author=author, license='CC0-1.0', source=page,
                                   download=url, source_sha256=digest(original)), music=True)
    for name, (packname, filename, duration) in KENNEY.items():
        archive = ROOT / f'tools/kenney-source/kenney_{packname}.zip'
        with zipfile.ZipFile(archive) as pack:
            raw = SOURCE / 'kenney-input.ogg'; raw.write_bytes(pack.read('Audio/' + filename))
        data = decode(raw, 1).ravel()
        indices = np.flatnonzero(np.abs(data) > .002)
        if len(indices): data = data[max(0, indices[0] - 100):min(len(data), indices[-1] + 500)]
        prepare_sfx('sfx_' + name, data[:int(duration * RATE)], dict(author='Kenney', license='CC0-1.0',
                    source=f'https://kenney.nl/assets/{packname}', sample='Audio/' + filename))
    custom = {
        'coin': chime([1046.5, 1567.98], .13, .045),
        'heal': chime([523.25, 659.25, 783.99], .4, .1),
        'death': chime([392, 329.63, 261.63], .46, .13),
        'skill': chime([440, 659.25], .32, .06),
        'weapon_sword': layer((0, whoosh(.20), 2), (.02, tone(880, .13), .08)),
        'weapon_daggers': layer((0, whoosh(.085), 2), (.085, whoosh(.09), 1.7)),
        'weapon_axe': layer((0, whoosh(.34, True), 3), (.05, tone(130.81, .26), .08)),
        'weapon_crossbow': layer((0, tone(220, .24), .9), (0, whoosh(.055), .6)),
        'weapon_dartgun': layer((0, tone(440, .10, 10), .8), (0, whoosh(.07), 1.5)),
        'weapon_firestaff': layer((0, whoosh(.38, True), 2.5), (.015, tone(196, .30), .17)),
        'skill_whirlwind': layer((0, whoosh(.42), 2), (.16, whoosh(.4, True), 1.8)),
        'skill_fury': layer(*[(i * .09, whoosh(.14), 1.5) for i in range(3)]),
        'skill_storm': layer(*[(i * .10, whoosh(.25, i % 2 == 0), 2) for i in range(5)]),
        'skill_multishot': chime([329.63, 440, 659.25], .18, .025),
        'skill_volley': chime([440, 554.37, 659.25, 880], .20, .055),
        'skill_rain': chime([1046.5, 880, 783.99, 659.25, 523.25], .25, .055),
        'skill_blink': layer((0, chime([392, 783.99], .27, .06), .5), (0, whoosh(.25), 1.4))
    }
    for name, data in custom.items():
        prepare_sfx('sfx_' + name, data, dict(author='SEAPP 项目原创', license='项目原创', method='确定性噪声滤波与柔和正弦泛音合成，无外部采样'))
    (DEST / 'audio-manifest.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')


def audit():
    """独立解码两种发布格式，检查时长、非静音、峰值、校验和及实际综合响度。"""
    manifest = json.loads((DEST / 'audio-manifest.json').read_text(encoding='utf-8'))
    result = {}
    for key, record in manifest.items():
        durations = []
        for ext in ['ogg', 'm4a']:
            path = DEST / f'{key}.{ext}'
            assert digest(path) == record[ext + '_sha256'], f'{path}: 校验和不匹配'
            data = decode(path)
            peak = float(np.max(np.abs(data))); rms = float(np.sqrt(np.mean(data ** 2)))
            assert 0.0005 < rms and peak < .99, f'{path}: 静音或削波 {rms=} {peak=}'
            durations.append(len(data) / RATE)
            if key.startswith('bgm_'):
                assert durations[-1] > 60, f'{path}: 配乐过短'
                stats = subprocess.run([FFMPEG, '-hide_banner', '-i', str(path), '-af',
                    'loudnorm=I=-22:TP=-3:LRA=11:print_format=json', '-f', 'null', '-'],
                    capture_output=True, check=True).stderr.decode()
                measured, _ = json.JSONDecoder().raw_decode(stats[stats.rindex('{'):])
                loudness = float(measured['input_i'])
                assert abs(loudness + 22) < 1.0, f'{path}: 综合响度偏离目标 {loudness}'
                result[path.name] = loudness
        assert abs(durations[0] - durations[1]) < .07, f'{key}: 双格式时长不一致 {durations}'
    print(json.dumps(dict(files=len(manifest) * 2, music_lufs=result, status='全部通过'), ensure_ascii=False, indent=4))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true'); parser.add_argument('--ffmpeg')
    parser.add_argument('--check', action='store_true', help='仅校验已生成文件，不写入资源')
    args = parser.parse_args()
    FFMPEG = args.ffmpeg or shutil.which('ffmpeg')
    if not FFMPEG:
        import imageio_ffmpeg
        FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
    RNG = np.random.default_rng(20261029)
    REPORT = {}
    if args.check: audit()
    else: main(args.download)
