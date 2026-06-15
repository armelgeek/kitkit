import requests

with open("test.jpg", "wb") as f:
    f.write(requests.get("https://flow-content.google/image/3ccf6cce-634e-4f03-a0c2-ad5212c12ccd?Expires=1781554950&KeyName=labs-flow-prod-cdn-key&Signature=8cRcqu-8Bj9Ilcj_OGeOjTy-Cow").content)