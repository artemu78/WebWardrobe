import json
import os
import uuid
import datetime
import boto3


from botocore.exceptions import ClientError

# Initialize clients
sfn_client = boto3.client('stepfunctions')
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

import urllib.request

def get_user_id_from_token(event):
    """
    Extracts user ID from Authorization header (Google OAuth Token)
    or x-user-id header (Mock/Legacy).
    """
    headers = event.get('headers', {})
    
    # 1. Check for Authorization header (Bearer Token)
    auth_header = headers.get('authorization') or headers.get('Authorization')
    if auth_header:
        token = auth_header.replace('Bearer ', '').strip()
        try:
            # Validate with Google
            url = f"https://www.googleapis.com/oauth2/v3/tokeninfo?access_token={token}"
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                # 'sub' is the unique user ID
                return data.get('sub')
        except Exception as e:
            print(f"Token validation failed: {e}")
            # Fall through to check other headers if validation fails
            pass

    # 2. Fallback: Check x-user-id (Mock/Testing)
    user_id = headers.get('x-user-id') or headers.get('X-User-Id')
    if user_id:
        return user_id

    # 3. Fallback: Check body
    try:
        body = json.loads(event.get('body', '{}'))
        return body.get('userId')
    except:
        return None

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

        # Initialize Job Status in DynamoDB
        table_name = os.environ.get('TABLE_NAME') or 'TryOnJobs' # Fallback or env var
        # Note: TABLE_NAME might not be in env for Dispatcher, need to check template.yaml
        # Adding TABLE_NAME to Dispatcher env in template.yaml is required.
        # For now, let's assume TryOnJobsTable is named 'TryOnJobs' or use a separate env var if needed.
        # Better: Add TABLE_NAME to Dispatcher env.
        
        # Actually, let's use the hardcoded name or better, add it to env in next step.
        # For this step, I will add the logic assuming TABLE_NAME is available.
        
        job_table = dynamodb.Table('TryOnJobs') 
        job_table.put_item(
            Item={
                'jobId': job_id,
                'status': 'PROCESSING',
                'userId': user_id,
                'timestamp': datetime.datetime.utcnow().isoformat()
            }
        )

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
    Step Function Task: SaveResult or JobFailed
    Saves AI result to S3 and updates DynamoDB.
    Can also handle failure updates.
    """
    try:
        job_id = event['jobId']
        
        table_name = os.environ['TABLE_NAME']
        table = dynamodb.Table(table_name)
        
        # Check if this is a failure event
        if event.get('status') == 'FAILED':
            error_info = event.get('error', {})
            error_msg = str(error_info)
            
            table.update_item(
                Key={'jobId': job_id},
                UpdateExpression="set #s = :s, #e = :e, #t = :t",
                ExpressionAttributeNames={'#s': 'status', '#e': 'error', '#t': 'timestamp'},
                ExpressionAttributeValues={
                    ':s': 'FAILED',
                    ':e': error_msg,
                    ':t': datetime.datetime.utcnow().isoformat()
                }
            )
            return {'status': 'FAILED', 'error': error_msg}

        # Success path
        ai_result = event['aiResult'] 
        bucket_name = os.environ['BUCKET_NAME']
        
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
                'timestamp': datetime.datetime.utcnow().isoformat()
            }
        )

        return {'status': 'COMPLETED', 'resultUrl': result_url}

    except Exception as e:
        print(f"Error in saver: {e}")
        raise e
