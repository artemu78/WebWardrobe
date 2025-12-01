# Minimal stub for boto3 used in tests

def client(service_name, *args, **kwargs):
    class DummyClient:
        def __getattr__(self, name):
            def method(*a, **kw):
                # Return empty dict or simple placeholder
                return {}
            return method
    return DummyClient()

def resource(service_name, *args, **kwargs):
    class DummyTable:
        def __init__(self):
            self.store = {}
        def get_item(self, Key):
            return {'Item': self.store.get(Key.get('userId'))}
        def put_item(self, Item):
            self.store[Item['userId']] = Item
        def update_item(self, **kwargs):
            key = kwargs.get('Key', {})
            uid = key.get('userId')
            item = self.store.get(uid, {})
            expr = kwargs.get('UpdateExpression', '')
            if 'set credits = if_not_exists(credits, :start) - :dec' in expr:
                start = kwargs['ExpressionAttributeValues'].get(':start', 0)
                dec = kwargs['ExpressionAttributeValues'].get(':dec', 1)
                credits = item.get('credits', start) - dec
                item['credits'] = credits
            elif expr.startswith('SET'):
                names = kwargs.get('ExpressionAttributeNames', {})
                values = kwargs.get('ExpressionAttributeValues', {})
                for placeholder, attr_name in names.items():
                    # placeholder like '#e' maps to attr_name like 'email'
                    # value placeholder is like ':e' -> values[':e']
                    value_key = f":{attr_name[0].lower()}"
                    if value_key in values:
                        item[attr_name] = values[value_key]
            self.store[uid] = item
    class DummyDynamoDB:
        def Table(self, name):
            return DummyTable()
    return DummyDynamoDB()
