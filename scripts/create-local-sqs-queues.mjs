import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SQSClient,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';

const endpoint = process.env.SQS_ENDPOINT ?? 'http://localhost:4566';
const client = new SQSClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

try {
  const normalizeQueueUrl = (url) => {
    const queueUrl = new URL(url);
    const localEndpoint = new URL(endpoint);
    queueUrl.protocol = localEndpoint.protocol;
    queueUrl.host = localEndpoint.host;
    return queueUrl.toString();
  };

  const createQueue = async (queueName, attributes = {}) => {
    const result = await client.send(
      new CreateQueueCommand({ QueueName: queueName, Attributes: attributes }),
    );
    return normalizeQueueUrl(result.QueueUrl);
  };

  const deadLetterQueueUrl = await createQueue(
    'wager-transactions-dlq.fifo',
    { FifoQueue: 'true', ContentBasedDeduplication: 'false' },
  );
  const deadLetterQueue = await client.send(
    new GetQueueAttributesCommand({
      QueueUrl: deadLetterQueueUrl,
      AttributeNames: ['QueueArn'],
    }),
  );
  const deadLetterQueueArn = deadLetterQueue.Attributes?.QueueArn;

  if (!deadLetterQueueArn) {
    throw new Error('LocalStack did not return the Inbox DLQ ARN');
  }

  const inboxQueueUrl = await createQueue(
    'wager-transactions.fifo',
    { FifoQueue: 'true', ContentBasedDeduplication: 'false' },
  );
  await client.send(
    new SetQueueAttributesCommand({
      QueueUrl: inboxQueueUrl,
      Attributes: {
        VisibilityTimeout: '30',
        ReceiveMessageWaitTimeSeconds: '2',
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadLetterQueueArn,
          maxReceiveCount: '5',
        }),
      },
    }),
  );

  const outboxQueueUrl = await createQueue('wager-outbox');
  console.log(`wager-outbox: ${outboxQueueUrl}`);
  console.log(`wager-transactions.fifo: ${inboxQueueUrl}`);
  console.log(`wager-transactions-dlq.fifo: ${deadLetterQueueUrl}`);
} finally {
  client.destroy();
}