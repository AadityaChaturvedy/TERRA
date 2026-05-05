import ee
import time
ee.Initialize()
print(ee.Date('2024-01-01').format('YYYY-MM-dd').getInfo())
