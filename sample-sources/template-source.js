/**
 * @name 样例源 (平台无关模板)
 * @description 基于 lx-music 自定义源协议的最小骨架，不实现任何真实平台的接口。
 *   每个 action 都直接返回占位数据 / 抛出 "未实现" 错误。
 *   复制本文件为起点，按需替换为目标平台的真实请求逻辑即可。
 * @version 0.1.0
 * @author YZMusic
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  //  源标识：换成你自己的短名 (小写, 建议 2-4 字母)
  // ─────────────────────────────────────────────────────────────
  var SOURCE = 'demo';
  var SOURCE_NAME = '样例源';

  // ─────────────────────────────────────────────────────────────
  //  lx.request 回调 → Promise (宿主注入 lx.request, 可绕过 CORS)
  //  真实实现请替换 httpRequest 调用为目标平台的 API
  // ─────────────────────────────────────────────────────────────
  function httpRequest(url, opts) {
    return new Promise(function (resolve, reject) {
      lx.request(url, opts || {}, function (err, resp, body) {
        if (err) return reject(err);
        if (resp.statusCode < 200 || resp.statusCode >= 300) {
          return reject(new Error('HTTP ' + resp.statusCode));
        }
        resolve({ statusCode: resp.statusCode, headers: resp.headers, body: body });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  样例数据构造：同一批示例歌曲被 search / album.songs / artist.hotSongs 共用
  //  真实实现时请保持返回结构不变，仅替换字段值
  // ─────────────────────────────────────────────────────────────
  function buildSampleSongs(albumId, albumName) {
    var aid = albumId || 'demo-album-1';
    var aname = albumName || '示例专辑';
    return [1, 2, 3].map(function (i) {
      return {
        id: 'online::' + SOURCE + '::demo-song-' + i,
        songId: 'demo-song-' + i,
        type: 'online',
        source: SOURCE,
        title: '示例曲目 ' + i,
        artist: '示例艺术家',
        artists: [{ id: 'demo-artist-1', name: '示例艺术家' }],
        artistId: 'demo-artist-1',
        album: aname,
        albumId: aid,
        duration: 0,
        cover: '',
        url: ''
      };
    });
  }

  function buildSampleAlbum(albumId) {
    var aid = String(albumId || 'demo-album-1');
    var aname = '示例专辑 ' + aid;
    var songs = buildSampleSongs(aid, aname);
    return {
      id: aid,
      name: aname,
      picUrl: '',
      publishTime: 0,
      description: '',
      artist: { id: 'demo-artist-1', name: '示例艺术家' },
      company: '',
      size: songs.length,
      songs: songs,
      source: SOURCE
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  action 实现
  // ─────────────────────────────────────────────────────────────

  // musicSearch → 返回曲目数组
  async function onMusicSearch(info) {
    // info = { keyWord, page?, limit? }
    // 真实实现：调用平台搜索 API, map 返回列表到下面结构
    void info;
    return buildSampleSongs();
  }

  // lyric → 返回 LRC 字符串
  async function onLyric(info) {
    // info = { songId }
    void info;
    return '[00:00.00] 示例歌词 (未实现真实接口)\n';
  }

  // album → 返回专辑详情 (含 songs[])
  async function onAlbum(info) {
    // info = { albumId, page? }
    return buildSampleAlbum(info && info.albumId);
  }

  // artistInfo → 返回艺术家详情 (含 hotSongs[])
  async function onArtistInfo(info) {
    var hotSongs = buildSampleSongs();
    return {
      id: String(info && info.artistId || 'demo-artist-1'),
      name: '示例艺术家',
      picUrl: '',
      briefDesc: '',
      alias: [],
      musicSize: hotSongs.length,
      albumSize: 2,
      hotSongs: hotSongs,
      source: SOURCE
    };
  }

  // artistAlbums → 返回专辑数组 (每张专辑含样例歌曲)
  async function onArtistAlbums(info) {
    // info = { artistId, limit? }
    void info;
    return [
      buildSampleAlbum('demo-album-1'),
      buildSampleAlbum('demo-album-2')
    ];
  }

  // musicUrl → 返回可直接播放的音频 URL 字符串
  // 默认返回一个内嵌的短 "哔" 声 (data URI, 无版权, 零网络依赖)
  //   - 音频规格: WAV / 8kHz / 8-bit / mono / 880Hz 正弦 / 约 0.15s / 带淡入淡出
  var DEMO_BEEP = 'data:audio/wav;base64,UklGRtQEAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YbAEAACAgIGCgX56eXp/hYqKhXxzcHN9ipOTinttZ2t6jZqckHtnXmN3j6Kll31jVVpykKmvn39fTFFskK+4p4NcREdlj7TBsIhbPT1djbnLuo5aNjNUirzTxJVaMClLhb7cz51cKh9AgMDk2qZfJhU2ecDr5bBjIgwqcb/y77lpIwgjabnv8sBwKAgeYrPs9MZ4LQgaWqzp9cyAMwoWU6Xl99KHOQsTTJ3h99ePPw0QRpbc+NyWRhANP4/X9+GdTBMLOYfS9+WlUxYKM4DM9emsWhoILXjG9OyzYh4IKHDA8u+5aSMII2m57/LAcCgIHmKz7PTGeC0IGlqs6fXMfzMKFlOl5ffShzkLE0yd4ffXjz8NEEaW3PjclkYQDT+P1/fhnUwTCzmH0vflpVMWCjN/zPXprFoaCC14xvTss2IeCChwwPLvuWkjCCNpue/ywHAoCB5is+z0xngtCBparOn1zIAzChZTpeX30oc5CxNMneH3148/DRBGltz43JZGEA0/j9f34Z1MEws5h9L35aVTFgozgMz16axaGggteMb07LNiHggocMDy77lpIwgjabnv8sBwKAgeYrPs9MZ4LQgaWqzp9cx/MwoWU6Xl99KHOQsTTJ3h99ePPw0QRpbc+NyWRhANP4/X9+GdTBMLOYfS9+WlUxYKM4DM9emsWhoILXjG9OyzYh4IKHDA8u+5aSMII2m57/LAcCgIHmKz7PTGeC0IGlqs6fXMfzMKFlOl5ffShzkLE0yd4ffXjz8NEEaW3PjclkYQDT+P1/fhnUwTCzmH0vflpVMWCjN/zPXprFoaCC14xvTss2IeCChwwPLvuWkjCCNpue/ywHAoCB5is+z0xngtCBparOn1zH8zChZTpeX30oc5CxNMneH3148/DRBGltz43JZGEA0/j9f34Z1MEws5h9L35aVTFgozgMz16axaGggteMb07LNiHggocMDy77lpIwgjabnv8sBwKAgeYrPs9MZ4LQgaWqzp9cx/MwoWU6Xl99KHOQsTTJ3h99ePPw0QRpbc+NyWRhANP4/X9+GdTBMLOYfS9+WlUxYKM4DM9emsWhoILXjG9OyzYh4IKHDA8u+5aSMII2m57/LAcCgIHmKz7PTGeC0IGlqs6fXMfzMKFlOl5ffShzkLE0yd4ffXjz8NEEaW3PjclkYQDT+P1/fhnUwTCzmH0vflpVMWCjN/zPXprFoaCC14xvTss2IeCChwwPLvuWkjCCNpue/ywHAoCB5is+z0xngtCBparOn1zH8zChZTpeX30oc5CxNMneH3148/DRBGltz43JZGEA0/j9f34Z1MEws5h9L35aVTFgozgMz16axaGggteMb07LNiHggocMDy77lpIwgjabnv8sBwKAgeYrPs9MZ4LQgaWqzp9cx/MwoWU6Xl99KHOQsTTJ3h99ePPw0QRpbc+NyWRhANQI7V892cTxoUP4bJ6tmgWSUbP4C/4NWjYjAjQXq01s+lajssQ3WrzMmlcUU1RnKiwsKkd08+S3CauLujfFhHUG+TrrOgf2BQVm+NpaqcgmhaXXCInKGYhG9jZXKFlJmShHVsbHWCjI+Mg3p1dXqAhYaFgX59fn8=';
  async function onMusicUrl(info) {
    // info = { musicInfo, type }  type 例: '128k' / '320k' / 'flac'
    void info;
    return DEMO_BEEP;
  }

  // ─────────────────────────────────────────────────────────────
  //  注册 request handler + inited
  //  宿主通过 lx.on(request) 分发 action, 通过 lx.send(inited) 识别可用源
  // ─────────────────────────────────────────────────────────────
  lx.on(lx.EVENT_NAMES.request, async function (req) {
    var action = req && req.action;
    var source = req && req.source;
    var info = (req && req.info) || {};

    if (source !== SOURCE) throw new Error('不支持的 source: ' + source);

    switch (action) {
      case 'musicSearch':  return await onMusicSearch(info);
      case 'musicUrl':     return await onMusicUrl(info);
      case 'lyric':        return await onLyric(info);
      case 'album':        return await onAlbum(info);
      case 'artistInfo':   return await onArtistInfo(info);
      case 'artistAlbums': return await onArtistAlbums(info);
      default:
        throw new Error('不支持的 action: ' + action);
    }
  });

  lx.send(lx.EVENT_NAMES.inited, {
    sources: (function () {
      var s = {};
      s[SOURCE] = {
        name: SOURCE_NAME,
        actions: ['musicSearch', 'musicUrl', 'lyric', 'album', 'artistInfo', 'artistAlbums']
      };
      return s;
    })()
  });

  // 未使用但留作参考: httpRequest 仅在切换到真实接口时使用
  void httpRequest;
})();
