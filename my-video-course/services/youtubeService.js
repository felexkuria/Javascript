const { google } = require('googleapis');

class YouTubeService {
  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
  }

  async getPlaylistVideos(playlistId) {
    try {
      const response = await this.youtube.playlistItems.list({
        part: 'snippet,contentDetails',
        playlistId: playlistId,
        maxResults: 50
      });

      return response.data.items.map(item => ({
        _id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnailUrl: item.snippet.thumbnails.medium?.url,
        youtubeId: item.snippet.resourceId.videoId,
        duration: item.contentDetails?.duration,
        position: item.snippet.position,
        publishedAt: item.snippet.publishedAt,
        isYouTube: true
      }));
    } catch (error) {
      console.error('YouTube API error:', error);
      throw error;
    }
  }

  async getPlaylistInfo(playlistId) {
    try {
      const response = await this.youtube.playlists.list({
        part: 'snippet',
        id: playlistId
      });

      const playlist = response.data.items[0];
      return {
        id: playlistId,
        title: playlist.snippet.title,
        description: playlist.snippet.description,
        thumbnailUrl: playlist.snippet.thumbnails.medium?.url,
        channelTitle: playlist.snippet.channelTitle
      };
    } catch (error) {
      console.error('YouTube playlist info error:', error);
      throw error;
    }
  }
}

module.exports = new YouTubeService();