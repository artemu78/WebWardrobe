import json
import os
import uuid
import boto3
from botocore.exceptions import ClientError

# Initialize clients
sfn_client = boto3.client('stepfunctions')
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

def get_user_id_from_token(event):
    # In a real app, verify the Google ID token here.
    # For now, we'll trust the client sends a 'userId' or 'Authorization' header we treat as ID.
    # Or better, the client sends the ID token in Auth header, and we decode it.
    # To keep this simple and runnable without real Google keys, we will accept a 'x-user-id' header
    # or extract it from the body if strictly necessary, but header is better for GET requests.
    
    # MOCK AUTH:
    headers = event.get('headers', {})
    user_id = headers.get('x-user-id') or headers.get('X-User-Id')
    if not user_id:
        # Fallback for body
        try:
            body = json.loads(event.get('body', '{}'))
            user_id = body.get('userId')
        except:
            pass
            
    return user_id

def dispatcher_handler(event, context):
    """
    Triggered by POST /try-on
    Body: { itemUrl, selfieId }
    Headers: { x-user-id: ... }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        item_url = body.get('itemUrl')
        selfie_id = body.get('selfieId')
        user_id = get_user_id_from_token(event)

        if not item_url or not selfie_id or not user_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing itemUrl, selfieId, or user authentication'})
            }

        # Lookup Selfie URL
        user_table_name = os.environ['USER_TABLE_NAME']
        user_table = dynamodb.Table(user_table_name)
        
        user_profile = user_table.get_item(Key={'userId': user_id}).get('Item')
        if not user_profile:
             return {'statusCode': 404, 'body': json.dumps({'error': 'User profile not found'})}
             
        images = user_profile.get('images', [])
        selfie_url = next((img['s3Url'] for img in images if img['id'] == selfie_id), None)
        
        if not selfie_url:
            return {'statusCode': 404, 'body': json.dumps({'error': 'Selfie not found'})}

        job_id = str(uuid.uuid4())
        state_machine_arn = os.environ['STATE_MACHINE_ARN']

        # Input for the Step Function
        sfn_input = {
            'jobId': job_id,
            'userId': user_id,
            'itemUrl': item_url,
            'selfieUrl': selfie_url
        }

        response = sfn_client.start_execution(
            stateMachineArn=state_machine_arn,
            name=job_id,
            input=json.dumps(sfn_input)
        )

        return {
            'statusCode': 200,
            'body': json.dumps({
                'jobId': job_id,
                'executionArn': response['executionArn'],
                'message': 'Try-on job started'
            })
        }

    except Exception as e:
        print(f"Error in dispatcher: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def profile_handler(event, context):
    """
    Handles /user/images routes
    """
    try:
        path = event.get('rawPath') or event.get('path') # HTTP API uses rawPath
        method = event.get('requestContext', {}).get('http', {}).get('method')
        user_id = get_user_id_from_token(event)
        
        if not user_id:
             return {'statusCode': 401, 'body': json.dumps({'error': 'Unauthorized'})}

        user_table_name = os.environ['USER_TABLE_NAME']
        bucket_name = os.environ['BUCKET_NAME']
        user_table = dynamodb.Table(user_table_name)

        # POST /user/images/upload-url
        if method == 'POST' and 'upload-url' in path:
            body = json.loads(event.get('body', '{}'))
            filename = body.get('filename')
            content_type = body.get('contentType', 'image/jpeg')
            
            file_id = str(uuid.uuid4())
            s3_key = f"uploads/{user_id}/{file_id}-{filename}"
            
            # Generate Presigned URL
            url = s3_client.generate_presigned_url(
                'put_object',
                Params={'Bucket': bucket_name, 'Key': s3_key, 'ContentType': content_type},
                ExpiresIn=300
            )
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'uploadUrl': url,
                    's3Key': s3_key,
                    'fileId': file_id
                })
            }

        # POST /user/images (Confirm upload)
        elif method == 'POST':
            body = json.loads(event.get('body', '{}'))
            name = body.get('name')
            s3_key = body.get('s3Key')
            file_id = body.get('fileId')
            
            if not name or not s3_key or not file_id:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Missing fields'})}
            
            # Check limit
            user_profile = user_table.get_item(Key={'userId': user_id}).get('Item', {})
            current_images = user_profile.get('images', [])
            if len(current_images) >= 5:
                 return {'statusCode': 400, 'body': json.dumps({'error': 'Maximum 5 images allowed'})}

            s3_url = f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"
            
            # Add to DynamoDB list
            user_table.update_item(
                Key={'userId': user_id},
                UpdateExpression="SET #i = list_append(if_not_exists(#i, :empty_list), :new_image)",
                ExpressionAttributeNames={'#i': 'images'},
                ExpressionAttributeValues={
                    ':new_image': [{
                        'id': file_id,
                        'name': name,
                        's3Url': s3_url,
                        's3Key': s3_key
                    }],
                    ':empty_list': []
                }
            )
            
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Image saved', 'id': file_id, 'url': s3_url})
            }

        # GET /user/images
        elif method == 'GET':
            response = user_table.get_item(Key={'userId': user_id})
            item = response.get('Item', {})
            images = item.get('images', [])
            return {
                'statusCode': 200,
                'body': json.dumps({'images': images})
            }

        else:
            return {'statusCode': 404, 'body': json.dumps({'error': 'Not found'})}

    except Exception as e:
        print(f"Error in profile handler: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def status_handler(event, context):
    """
    Triggered by GET /status/{jobId}
    Checks DynamoDB for job status.
    """
    try:
        job_id = event['pathParameters']['jobId']
        table_name = os.environ['TABLE_NAME']
        table = dynamodb.Table(table_name)

        response = table.get_item(Key={'jobId': job_id})
        item = response.get('Item')

        if not item:
            return {
                'statusCode': 200,
                'body': json.dumps({'status': 'PROCESSING'})
            }

        return {
            'statusCode': 200,
            'body': json.dumps(item)
        }

    except Exception as e:
        print(f"Error in status check: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def saver_handler(event, context):
    """
    Step Function Task: SaveResult
    Saves AI result to S3 and updates DynamoDB.
    """
    try:
        job_id = event['jobId']
        ai_result = event['aiResult'] 
        
        bucket_name = os.environ['BUCKET_NAME']
        table_name = os.environ['TABLE_NAME']
        table = dynamodb.Table(table_name)
        
        s3_key = f"results/{job_id}.json"
        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=json.dumps(ai_result),
            ContentType='application/json'
        )
        
        result_url = f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"

        table.put_item(
            Item={
                'jobId': job_id,
                'status': 'COMPLETED',
                'resultUrl': result_url,
                'timestamp': str(uuid.uuid1())
            }
        )

        return {'status': 'COMPLETED', 'resultUrl': result_url}

    except Exception as e:
        print(f"Error in saver: {e}")
        raise e
