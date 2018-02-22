from flask import render_template
from app import app

###
#Move this elsewhere
###
import pathlib
from shutil import copyfile

import csv
import pickle

import xml.etree.ElementTree as ET

import xmltodict
import callnumber as callnumber

from app.newtitles import combine_xml, pad_bsn, prettify_xml
from app.title import NewTitle, NewTitleXML

# Read a txt file of isbns
# File should be named append-bsns.txt
# Make an argument?
def process():
    append_infile = 'app/data/in/append-bsns.txt'

    append_exists = pathlib.Path(append_infile).exists()

    if append_exists:
        with open(append_infile, "r") as f:
            append_bsns = f.read().splitlines()
            append_bsns = [pad_bsn(bsn) for bsn in append_bsns]

        #Transform list into XML file
        root = ET.Element('printout')

        for i, item in enumerate(append_bsns):
            temp = ET.Element('ROW')
            child = ET.Element('BSN')
            child.text = item
            temp.append(child)
            child = ET.Element('BARCODE')
            child.text = str(i)
            temp.append(child)
            root.append(temp)

            # pretty string
            xmlstr = prettify_xml(ET.tostring(root))

            # Write append record to xml file
            with open('app/data/tmp/append_bsns.xml', 'w') as f:
                f.write(xmlstr)

            # Delete infile?

    # Combine xml NT report with append
    # File should be named report.xml
    # Make an argument?
    process_infile = 'app/data/in/report.xml'
    process_tmp = 'app/data/tmp/report.xml'
    copyfile(process_infile, process_tmp)

    combined_xml = combine_xml('app/data/tmp/')
    xmlstr = prettify_xml(combined_xml)

    process_outfile = 'app/data/out/full_report.xml'

    with open(process_outfile, "w") as f:
        f.write(xmlstr)

    with open(process_outfile) as f:
        doc = xmltodict.parse(f.read())

    # Logging?    
    print('There are {} records in this month\'s report.'.format(len(doc['printout']['ROW'])))

    report = []

    for row in doc['printout']['ROW']:
        item = {}
        item['barcode'] = row['BARCODE']
        item['bsn'] = row['BSN']
        if 'VOLUME_INFO' in row.keys():
            item['volume'] = row['VOLUME_INFO']
            if '(' in item['volume']:
                item['volume'] = item['volume'].replace('(',' (')

        if 'Z13_IMPRINT' in row.keys():
            item['imprint'] = row['Z13_IMPRINT']

        report.append(item)

    barcodes = [item['barcode'] for item in report]
    bsns = [item['bsn'] for item in report]

    # Move to newtitles.py
    # http://stackoverflow.com/a/3308844

    import unicodedata as ud

    latin_letters= {}

    def is_latin(uchr):
        try: return latin_letters[uchr]
        except KeyError:
             return latin_letters.setdefault(uchr, 'LATIN' in ud.name(uchr))

    def only_roman_chars(unistr):
        return all(is_latin(uchr)
               for uchr in unistr
               if uchr.isalpha()) # isalpha suggested by John Machin


    records = []
    processed = 0

    for i, barcode in enumerate(barcodes):
        bc_index = barcodes.index(barcode)

        bsn = report[bc_index]['bsn']


        new_title = NewTitle(bsn)
        #print("Processing record %d: %s" % (i+1, bsn))
        processed += 1
        record = {}
        record['bsn'] = bsn
        record['title'] = new_title.format_title()
        record['char'] = only_roman_chars(record['title'])
        record['contributor'] = new_title.format_contributor()
        record['edition'] = new_title.format_edition()

        if 'imprint' in report[bc_index].keys():
            record['imprint'] = report[bc_index]['imprint'].strip()
            record['imprint'] = record['imprint'][:-1] if record['imprint'][-1] == '.' else record['imprint']
        else:
            record['imprint'] = new_title.format_imprint()

        record['imprint'] = new_title.format_imprint()
        record['collection'] = new_title.format_collection()
        record['series'] = new_title.format_series()

        if 'volume' in report[bc_index].keys():
            record['volume'] = report[bc_index]['volume'].replace('.', '. ')
        else:
            record['volume'] = ""

        # FIX!
        record['callnumber'] = new_title.format_callnumber()
        if record['callnumber']:
            record['lccn'] = callnumber.LC(record['callnumber']).normalized
        else:
            record['lccn'] = "Call number missing"

        if record['lccn'] == None:
            record['lccn'] = record['callnumber'].strip().title()

        if record['volume']:
            if record['callnumber']:
                record['callnumber'] += " " + record['volume']

        record['gift'] = new_title.format_gift()
        record['handle'] = new_title.format_handle()

        records.append(record)


    print('\nFinished processing %d records.' % processed)


    ## Choose category using call number map



    with open('app/data/ref/lc_classes.csv', 'r') as f:
      reader = csv.reader(f)
      lc_classes = list(reader)

    for i, record in enumerate(records):
        #print(i, record['title'], record['callnumber'])
        record['category'] = 'other'
        if record['callnumber']:
            cn = callnumber.LC(record['callnumber'])
            cn_split = cn.components()
            #print(cn_split)
            if cn_split:
                if len(cn_split) > 1:
                    if cn_split[0] in [item[0] for item in lc_classes]:
                        #print('Yes')
                        rows = [item for item in lc_classes if cn_split[0]==item[0]]
                        for row in rows:
                            #print(row)
                            if float(row[1]) <= float(cn_split[1]) <= float(row[2]):
                                #print(float(row[1]) <= float(cn_split[1]) <= float(row[2]))
                                record['category'] = row[3]
                                #print('Updated!')
                                break
            else:
                print(record['title'], record['lccn'])


    ## Guess category

    from app.data.ref.train import train
    import random
    from sklearn.feature_extraction.text import CountVectorizer
    from sklearn.feature_extraction.text import TfidfTransformer
    from sklearn.naive_bayes import MultinomialNB

    from nltk.corpus import stopwords
    stops = stopwords.words('english') + stopwords.words('german') + stopwords.words('french')

    def preprocess(text):
        punctuation ="\"#$%&\'()*+,-/:;<=>@[\]^_`{|}~.?!"
        translator = str.maketrans({key: " " for key in punctuation})
        text = text.translate(translator)

        symbols = "©"
        translator = str.maketrans({key: " " for key in symbols})
        text = text.translate(translator)

        translator = str.maketrans({key: " " for key in '0123456789'})
        text = text.translate(translator)

        return text

    data_ = [item for item in train]
    data_ = random.sample(data_, len(data_))
    train_data = [preprocess(item[1]) for item in data_][:2000]
    train_target = [item[0] for item in data_][:2000]
    test_data = [preprocess(item[1]) for item in data_][2000:]
    test_target = [item[0] for item in data_][2000:]

    categories = set([item[0] for item in train])

    def predict_categories(titles):
        count_vect = CountVectorizer(stop_words=stops, min_df=5)
        X_train_counts = count_vect.fit_transform(train_data)
        tfidf_transformer = TfidfTransformer()
        X_train_tfidf = tfidf_transformer.fit_transform(X_train_counts)
        clf = MultinomialNB().fit(X_train_tfidf, train_target)
        X_new_counts = count_vect.transform(titles)
        X_new_tfidf = tfidf_transformer.transform(X_new_counts)
        predicted = clf.predict(X_new_tfidf)
        return predicted

    titles = [record['title'] for record in records]

    predicted_categories = predict_categories(titles)
    for i, category in enumerate(predicted_categories):
        if records[i]['category'] == 'other':
            records[i]['title'] = "*"+records[i]['title']
            records[i]['category'] = category

    records = sorted(records, key=lambda k: (k['lccn'], int(''.join(list(filter(str.isdigit, "0"+ k['volume']))))))
    print(records[:10])
            
    with open('app/data/ref/newtitles.p', 'wb') as f:
        pickle.dump(records, f)
    
###

import pickle

nts = pickle.load(open("app/data/ref/newtitles.p", "rb" ))

cats = ['Classical Antiquity & Western Europe',
        'Egypt & North Africa',
        'The Ancient Near East & Asia Minor',
        'The Caucasus & The Western Steppe',
        'Central Asia & Siberia',
        'China, South Asia, & East Asia',
        'Cross-Cultural Studies & Other']

@app.route('/')
def index():
    # Break process() up into smaller functions
    process()
    return render_template("index.html",
                           title='Home',
                           range_low = 'December 1, 2017',
                           range_high = 'December 31, 2017',
                           zotero='https://www.zotero.org/groups/290269/isaw_library_new_titles/items/collectionKey/PWFRN5US',
                           nts=nts,
                           cats=cats #cats=set([nt['category'].title() for nt in nts])
                          )



@app.route('/test')
def xml_test():
    #XML = NewTitleXML('002061459')
    #info = XML.root
    import requests
    from pprint import pprint
    r = requests.get("http://aleph.library.nyu.edu/X?op=publish_avail&library=nyu01&doc_num=002061459")
    info = xmltodict.parse(r.content)['publish-avail']['OAI-PMH']['ListRecords']['record']['metadata']['record']
    pprint(dict(info))
    info = dict(info)
    return render_template('test.html', info=info)



# Fix insertion of date range
