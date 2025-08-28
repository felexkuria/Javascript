const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

class DynamoService {
  constructor() {
    this.client = new DynamoDBClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.docClient = DynamoDBDocumentClient.from(this.client);
    this.videosTable = 'video-course-videos';
    this.progressTable = 'video-course-progress';
    this.playlistsTable = 'video-course-playlists';
  }

  // Video operations
  async saveVideo(courseName, video) {
    const params = {
      TableName: this.videosTable,
      Item: {
        PK: `COURSE#${courseName}`,
        SK: `VIDEO#${video._id}`,
        ...video,
        courseName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    await this.docClient.send(new PutCommand(params));
  }

  async getVideosForCourse(courseName) {
    const params = {
      TableName: this.videosTable,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `COURSE#${courseName}`
      }
    };
    const result = await this.docClient.send(new QueryCommand(params));
    return result.Items || [];
  }

  async getVideoById(courseName, videoId) {
    const params = {
      TableName: this.videosTable,
      Key: {
        PK: `COURSE#${courseName}`,
        SK: `VIDEO#${videoId}`
      }
    };
    const result = await this.docClient.send(new GetCommand(params));
    return result.Item;
  }

  // YouTube playlist operations
  async savePlaylist(playlistId, playlistData) {
    const params = {
      TableName: this.playlistsTable,
      Item: {
        PK: `PLAYLIST#${playlistId}`,
        SK: 'METADATA',
        ...playlistData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    await this.docClient.send(new PutCommand(params));
  }

  async getPlaylist(playlistId) {
    const params = {
      TableName: this.playlistsTable,
      Key: {
        PK: `PLAYLIST#${playlistId}`,
        SK: 'METADATA'
      }
    };
    const result = await this.docClient.send(new GetCommand(params));
    return result.Item;
  }

  // Progress tracking
  async updateProgress(userId, courseName, videoId, progress) {
    const params = {
      TableName: this.progressTable,
      Key: {
        PK: `USER#${userId}`,
        SK: `COURSE#${courseName}#VIDEO#${videoId}`
      },
      UpdateExpression: 'SET progress = :progress, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':progress': progress,
        ':updatedAt': new Date().toISOString()
      }
    };
    await this.docClient.send(new UpdateCommand(params));
  }
}

module.exports = new DynamoService();