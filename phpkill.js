
1	/*
2	   +----------------------------------------------------------------------+
3	   | PHP Version 5                                                        |
4	   +----------------------------------------------------------------------+
5	   | Copyright (c) 1997-2012 The PHP Group                                |
6	   +----------------------------------------------------------------------+
7	   | This source file is subject to version 3.01 of the PHP license,      |
8	   | that is bundled with this package in the file LICENSE, and is        |
9	   | available through the world-wide-web at the following url:           |
10	   | http://www.php.net/license/3_01.txt                                  |
11	   | If you did not receive a copy of the PHP license and are unable to   |
12	   | obtain it through the world-wide-web, please send a note to          |
13	   | license@php.net so we can mail you a copy immediately.               |
14	   +----------------------------------------------------------------------+
15	   | Authors: Rasmus Lerdorf <rasmus@lerdorf.on.ca>                       |
16	   |          Zeev Suraski <zeev@zend.com>                                |
17	   +----------------------------------------------------------------------+
18	 */
19	
20	/* $Id$ */
21	
22	#include <stdio.h>
23	#include "php.h"
24	#include "ext/standard/php_standard.h"
25	#include "ext/standard/credits.h"
26	#include "php_variables.h"
27	#include "php_globals.h"
28	#include "php_content_types.h"
29	#include "SAPI.h"
30	#include "php_logos.h"
31	#include "zend_globals.h"
32	
33	/* for systems that need to override reading of environment variables */
34	void _php_import_environment_variables(zval *array_ptr TSRMLS_DC);
35	PHPAPI void (*php_import_environment_variables)(zval *array_ptr TSRMLS_DC) = _php_import_environment_variables;
36	
37	PHPAPI void php_register_variable(char *var, char *strval, zval *track_vars_array TSRMLS_DC)
38	{
39	        php_register_variable_safe(var, strval, strlen(strval), track_vars_array TSRMLS_CC);
40	}
41	
42	/* binary-safe version */
43	PHPAPI void php_register_variable_safe(char *var, char *strval, int str_len, zval *track_vars_array TSRMLS_DC)
44	{
45	        zval new_entry;
46	        assert(strval != NULL);
47	        
48	        /* Prepare value */
49	        Z_STRLEN(new_entry) = str_len;
50	        if (PG(magic_quotes_gpc)) {
51	                Z_STRVAL(new_entry) = php_addslashes(strval, Z_STRLEN(new_entry), &Z_STRLEN(new_entry), 0 TSRMLS_CC);
52	        } else {
53	                Z_STRVAL(new_entry) = estrndup(strval, Z_STRLEN(new_entry));
54	        }
55	        Z_TYPE(new_entry) = IS_STRING;
56	
57	        php_register_variable_ex(var, &new_entry, track_vars_array TSRMLS_CC);
58	}
59	
60	PHPAPI void php_register_variable_ex(char *var_name, zval *val, zval *track_vars_array TSRMLS_DC)
61	{
62	        char *p = NULL;
63	        char *ip;               /* index pointer */
64	        char *index, *escaped_index = NULL;
65	        char *var, *var_orig;
66	        int var_len, index_len;
67	        zval *gpc_element, **gpc_element_p;
68	        zend_bool is_array = 0;
69	        HashTable *symtable1 = NULL;
70	
71	        assert(var_name != NULL);
72	
73	        if (track_vars_array) {
74	                symtable1 = Z_ARRVAL_P(track_vars_array);
75	        } else if (PG(register_globals)) {
76	                if (!EG(active_symbol_table)) {
77	                        zend_rebuild_symbol_table(TSRMLS_C);
78	                }
79	                symtable1 = EG(active_symbol_table);
80	        }
81	        if (!symtable1) {
82	                /* Nothing to do */
83	                zval_dtor(val);
84	                return;
85	        }
86	
87	        /*
88	         * Prepare variable name
89	         */
90	
91	        var_orig = estrdup(var_name);
92	        var = var_orig;
93	        /* ignore leading spaces in the variable name */
94	        while (*var && *var==' ') {
95	                var++;
96	        }
97	
98	        /* ensure that we don't have spaces or dots in the variable name (not binary safe) */
99	        for (p = var; *p; p++) {
100	                if (*p == ' ' || *p == '.') {
101	                        *p='_';
102	                } else if (*p == '[') {
103	                        is_array = 1;
104	                        ip = p;
105	                        *p = 0;
106	                        break;
107	                }
108	        }
109	        var_len = p - var;
110	
111	        if (var_len==0) { /* empty variable name, or variable name with a space in it */
112	                zval_dtor(val);
113	                efree(var_orig);
114	                return;
115	        }
116	
117	        /* GLOBALS hijack attempt, reject parameter */
118	        if (symtable1 == EG(active_symbol_table) &&
119	                var_len == sizeof("GLOBALS")-1 &&
120	                !memcmp(var, "GLOBALS", sizeof("GLOBALS")-1)) {
121	                zval_dtor(val);
122	                efree(var_orig);
123	                return;
124	        }
125	
126	        index = var;
127	        index_len = var_len;
128	
129	        if (is_array) {
130	                int nest_level = 0;
131	                while (1) {
132	                        char *index_s;
133	                        int new_idx_len = 0;
134	
135	                        if(++nest_level > PG(max_input_nesting_level)) {
136	                                HashTable *ht;
137	                                /* too many levels of nesting */
138	
139	                                if (track_vars_array) {
140	                                        ht = Z_ARRVAL_P(track_vars_array);
141	                                        zend_hash_del(ht, var, var_len + 1);
142	                                } else if (PG(register_globals)) {
143	                                        ht = EG(active_symbol_table);
144	                                        zend_hash_del(ht, var, var_len + 1);
145	                                }
146	
147	                                zval_dtor(val);
148	
149	                                /* do not output the error message to the screen,
150	                                 this helps us to to avoid "information disclosure" */
151	                                if (!PG(display_errors)) {
152	                                        php_error_docref(NULL TSRMLS_CC, E_WARNING, "Input variable nesting level exceeded %ld. To increase the limit change max_input_nesting_level in php.ini.", PG(max_input_nesting_level));
153	                                }
154	                                efree(var_orig);
155	                                return;
156	                        }
157	
158	                        ip++;
159	                        index_s = ip;
160	                        if (isspace(*ip)) {
161	                                ip++;
162	                        }
163	                        if (*ip==']') {
164	                                index_s = NULL;
165	                        } else {
166	                                ip = strchr(ip, ']');
167	                                if (!ip) {
168	                                        /* PHP variables cannot contain '[' in their names, so we replace the character with a '_' */
169	                                        *(index_s - 1) = '_';
170	
171	                                        index_len = 0;
172	                                        if (index) {
173	                                                index_len = strlen(index);
174	                                        }
175	                                        goto plain_var;
176	                                        return;
177	                                }
178	                                *ip = 0;
179	                                new_idx_len = strlen(index_s);  
180	                        }
181	
182	                        if (!index) {
183	                                MAKE_STD_ZVAL(gpc_element);
184	                                array_init(gpc_element);
185	                                zend_hash_next_index_insert(symtable1, &gpc_element, sizeof(zval *), (void **) &gpc_element_p);
186	                        } else {
187	                                if (PG(magic_quotes_gpc)) {
188	                                        escaped_index = php_addslashes(index, index_len, &index_len, 0 TSRMLS_CC);
189	                                } else {
190	                                        escaped_index = index;
191	                                }
192	                                if (zend_symtable_find(symtable1, escaped_index, index_len + 1, (void **) &gpc_element_p) == FAILURE
193	                                        || Z_TYPE_PP(gpc_element_p) != IS_ARRAY) {
194	                                        if (zend_hash_num_elements(symtable1) <= PG(max_input_vars)) {
195	                                                if (zend_hash_num_elements(symtable1) == PG(max_input_vars)) {
196	                                                        php_error_docref(NULL TSRMLS_CC, E_WARNING, "Input variables exceeded %ld. To increase the limit change max_input_vars in php.ini.", PG(max_input_vars));
197	                                                }
198	                                                MAKE_STD_ZVAL(gpc_element);
199	                                                array_init(gpc_element);
200	                                                zend_symtable_update(symtable1, escaped_index, index_len + 1, &gpc_element, sizeof(zval *), (void **) &gpc_element_p);
201	                                        } else {
202	                                                efree(var_orig);
203	                                                return;
204	                                        }
205	                                }
206	                                if (index != escaped_index) {
207	                                        efree(escaped_index);
208	                                }
209	                        }
210	                        symtable1 = Z_ARRVAL_PP(gpc_element_p);
211	                        /* ip pointed to the '[' character, now obtain the key */
212	                        index = index_s;
213	                        index_len = new_idx_len;
214	
215	                        ip++;
216	                        if (*ip == '[') {
217	                                is_array = 1;
218	                                *ip = 0;
219	                        } else {
220	                                goto plain_var;
221	                        }
222	                }
223	        } else {
224	plain_var:
225	                MAKE_STD_ZVAL(gpc_element);
226	                gpc_element->value = val->value;
227	                Z_TYPE_P(gpc_element) = Z_TYPE_P(val);
228	                if (!index) {
229	                        zend_hash_next_index_insert(symtable1, &gpc_element, sizeof(zval *), (void **) &gpc_element_p);
230	                } else {
231	                        if (PG(magic_quotes_gpc)) { 
232	                                escaped_index = php_addslashes(index, index_len, &index_len, 0 TSRMLS_CC);
233	                        } else {
234	                                escaped_index = index;
235	                        }
236	                        /* 
237	                         * According to rfc2965, more specific paths are listed above the less specific ones.
238	                         * If we encounter a duplicate cookie name, we should skip it, since it is not possible
239	                         * to have the same (plain text) cookie name for the same path and we should not overwrite
240	                         * more specific cookies with the less specific ones.
241	                         */
242	                        if (PG(http_globals)[TRACK_VARS_COOKIE] &&
243	                                symtable1 == Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_COOKIE]) &&
244	                                zend_symtable_exists(symtable1, escaped_index, index_len + 1)) {
245	                                zval_ptr_dtor(&gpc_element);
246	                        } else {
247	                                if (zend_hash_num_elements(symtable1) <= PG(max_input_vars)) {
248	                                        if (zend_hash_num_elements(symtable1) == PG(max_input_vars)) {
249	                                                php_error_docref(NULL TSRMLS_CC, E_WARNING, "Input variables exceeded %ld. To increase the limit change max_input_vars in php.ini.", PG(max_input_vars));
250	                                        }
251	                                        zend_symtable_update(symtable1, escaped_index, index_len + 1, &gpc_element, sizeof(zval *), (void **) &gpc_element_p);
252	                                } else {
253	                                        zval_ptr_dtor(&gpc_element);
254	                                }
255	                        }
256	                        if (escaped_index != index) {
257	                                efree(escaped_index);
258	                        }
259	                }
260	        }
261	        efree(var_orig);
262	}
263	
264	SAPI_API SAPI_POST_HANDLER_FUNC(php_std_post_handler)
265	{
266	        char *var, *val, *e, *s, *p;
267	        zval *array_ptr = (zval *) arg;
268	
269	        if (SG(request_info).post_data == NULL) {
270	                return;
271	        }       
272	
273	        s = SG(request_info).post_data;
274	        e = s + SG(request_info).post_data_length;
275	
276	        while (s < e && (p = memchr(s, '&', (e - s)))) {
277	last_value:
278	                if ((val = memchr(s, '=', (p - s)))) { /* have a value */
279	                        unsigned int val_len, new_val_len;
280	
281	                        var = s;
282	
283	                        php_url_decode(var, (val - s));
284	                        val++;
285	                        val_len = php_url_decode(val, (p - val));
286	                        val = estrndup(val, val_len);
287	                        if (sapi_module.input_filter(PARSE_POST, var, &val, val_len, &new_val_len TSRMLS_CC)) {
288	                                php_register_variable_safe(var, val, new_val_len, array_ptr TSRMLS_CC);
289	                        }
290	                        efree(val);
291	                }
292	                s = p + 1;
293	        }
294	        if (s < e) {
295	                p = e;
296	                goto last_value;
297	        }
298	}
299	
300	SAPI_API SAPI_INPUT_FILTER_FUNC(php_default_input_filter)
301	{
302	        /* TODO: check .ini setting here and apply user-defined input filter */
303	        if(new_val_len) *new_val_len = val_len;
304	        return 1;
305	}
306	
307	SAPI_API SAPI_TREAT_DATA_FUNC(php_default_treat_data)
308	{
309	        char *res = NULL, *var, *val, *separator = NULL;
310	        const char *c_var;
311	        zval *array_ptr;
312	        int free_buffer = 0;
313	        char *strtok_buf = NULL;
314	        
315	        switch (arg) {
316	                case PARSE_POST:
317	                case PARSE_GET:
318	                case PARSE_COOKIE:
319	                        ALLOC_ZVAL(array_ptr);
320	                        array_init(array_ptr);
321	                        INIT_PZVAL(array_ptr);
322	                        switch (arg) {
323	                                case PARSE_POST:
324	                                        if (PG(http_globals)[TRACK_VARS_POST]) {
325	                                                zval_ptr_dtor(&PG(http_globals)[TRACK_VARS_POST]);
326	                                        }
327	                                        PG(http_globals)[TRACK_VARS_POST] = array_ptr;
328	                                        break;
329	                                case PARSE_GET:
330	                                        if (PG(http_globals)[TRACK_VARS_GET]) {
331	                                                zval_ptr_dtor(&PG(http_globals)[TRACK_VARS_GET]);
332	                                        }
333	                                        PG(http_globals)[TRACK_VARS_GET] = array_ptr;
334	                                        break;
335	                                case PARSE_COOKIE:
336	                                        if (PG(http_globals)[TRACK_VARS_COOKIE]) {
337	                                                zval_ptr_dtor(&PG(http_globals)[TRACK_VARS_COOKIE]);
338	                                        }
339	                                        PG(http_globals)[TRACK_VARS_COOKIE] = array_ptr;
340	                                        break;
341	                        }
342	                        break;
343	                default:
344	                        array_ptr = destArray;
345	                        break;
346	        }
347	
348	        if (arg == PARSE_POST) {
349	                sapi_handle_post(array_ptr TSRMLS_CC);
350	                return;
351	        }
352	
353	        if (arg == PARSE_GET) {         /* GET data */
354	                c_var = SG(request_info).query_string;
355	                if (c_var && *c_var) {
356	                        res = (char *) estrdup(c_var);
357	                        free_buffer = 1;
358	                } else {
359	                        free_buffer = 0;
360	                }
361	        } else if (arg == PARSE_COOKIE) {               /* Cookie data */
362	                c_var = SG(request_info).cookie_data;
363	                if (c_var && *c_var) {
364	                        res = (char *) estrdup(c_var);
365	                        free_buffer = 1;
366	                } else {
367	                        free_buffer = 0;
368	                }
369	        } else if (arg == PARSE_STRING) {               /* String data */
370	                res = str;
371	                free_buffer = 1;
372	        }
373	
374	        if (!res) {
375	                return;
376	        }
377	
378	        switch (arg) {
379	                case PARSE_GET:
380	                case PARSE_STRING:
381	                        separator = (char *) estrdup(PG(arg_separator).input);
382	                        break;
383	                case PARSE_COOKIE:
384	                        separator = ";\0";
385	                        break;
386	        }
387	        
388	        var = php_strtok_r(res, separator, &strtok_buf);
389	        
390	        while (var) {
391	                val = strchr(var, '=');
392	
393	                if (arg == PARSE_COOKIE) {
394	                        /* Remove leading spaces from cookie names, needed for multi-cookie header where ; can be followed by a space */
395	                        while (isspace(*var)) {
396	                                var++;
397	                        }
398	                        if (var == val || *var == '\0') {
399	                                goto next_cookie;
400	                        }
401	                }
402	
403	                if (val) { /* have a value */
404	                        int val_len;
405	                        unsigned int new_val_len;
406	
407	                        *val++ = '\0';
408	                        php_url_decode(var, strlen(var));
409	                        val_len = php_url_decode(val, strlen(val));
410	                        val = estrndup(val, val_len);
411	                        if (sapi_module.input_filter(arg, var, &val, val_len, &new_val_len TSRMLS_CC)) {
412	                                php_register_variable_safe(var, val, new_val_len, array_ptr TSRMLS_CC);
413	                        }
414	                        efree(val);
415	                } else {
416	                        int val_len;
417	                        unsigned int new_val_len;
418	
419	                        php_url_decode(var, strlen(var));
420	                        val_len = 0;
421	                        val = estrndup("", val_len);
422	                        if (sapi_module.input_filter(arg, var, &val, val_len, &new_val_len TSRMLS_CC)) {
423	                                php_register_variable_safe(var, val, new_val_len, array_ptr TSRMLS_CC);
424	                        }
425	                        efree(val);
426	                }
427	next_cookie:
428	                var = php_strtok_r(NULL, separator, &strtok_buf);
429	        }
430	
431	        if (arg != PARSE_COOKIE) {
432	                efree(separator);
433	        }
434	
435	        if (free_buffer) {
436	                efree(res);
437	        }
438	}
439	
440	void _php_import_environment_variables(zval *array_ptr TSRMLS_DC)
441	{
442	        char buf[128];
443	        char **env, *p, *t = buf;
444	        size_t alloc_size = sizeof(buf);
445	        unsigned long nlen; /* ptrdiff_t is not portable */
446	
447	        /* turn off magic_quotes while importing environment variables */
448	        int magic_quotes_gpc = PG(magic_quotes_gpc);
449	        PG(magic_quotes_gpc) = 0;
450	
451	        for (env = environ; env != NULL && *env != NULL; env++) {
452	                p = strchr(*env, '=');
453	                if (!p) {                               /* malformed entry? */
454	                        continue;
455	                }
456	                nlen = p - *env;
457	                if (nlen >= alloc_size) {
458	                        alloc_size = nlen + 64;
459	                        t = (t == buf ? emalloc(alloc_size): erealloc(t, alloc_size));
460	                }
461	                memcpy(t, *env, nlen);
462	                t[nlen] = '\0';
463	                php_register_variable(t, p + 1, array_ptr TSRMLS_CC);
464	        }
465	        if (t != buf && t != NULL) {
466	                efree(t);
467	        }
468	        PG(magic_quotes_gpc) = magic_quotes_gpc;
469	}
470	
471	zend_bool php_std_auto_global_callback(char *name, uint name_len TSRMLS_DC)
472	{
473	        zend_printf("%s\n", name);
474	        return 0; /* don't rearm */
475	}
476	
477	/* {{{ php_build_argv
478	 */
479	static void php_build_argv(char *s, zval *track_vars_array TSRMLS_DC)
480	{
481	        zval *arr, *argc, *tmp;
482	        int count = 0;
483	        char *ss, *space;
484	        
485	        if (!(PG(register_globals) || SG(request_info).argc || track_vars_array)) {
486	                return;
487	        }
488	        
489	        ALLOC_INIT_ZVAL(arr);
490	        array_init(arr);
491	
492	        /* Prepare argv */
493	        if (SG(request_info).argc) { /* are we in cli sapi? */
494	                int i;
495	                for (i = 0; i < SG(request_info).argc; i++) {
496	                        ALLOC_ZVAL(tmp);
497	                        Z_TYPE_P(tmp) = IS_STRING;
498	                        Z_STRLEN_P(tmp) = strlen(SG(request_info).argv[i]);
499	                        Z_STRVAL_P(tmp) = estrndup(SG(request_info).argv[i], Z_STRLEN_P(tmp));
500	                        INIT_PZVAL(tmp);
501	                        if (zend_hash_next_index_insert(Z_ARRVAL_P(arr), &tmp, sizeof(zval *), NULL) == FAILURE) {
502	                                if (Z_TYPE_P(tmp) == IS_STRING) {
503	                                        efree(Z_STRVAL_P(tmp));
504	                                }
505	                        }
506	                }
507	        } else  if (s && *s) {
508	                ss = s;
509	                while (ss) {
510	                        space = strchr(ss, '+');
511	                        if (space) {
512	                                *space = '\0';
513	                        }
514	                        /* auto-type */
515	                        ALLOC_ZVAL(tmp);
516	                        Z_TYPE_P(tmp) = IS_STRING;
517	                        Z_STRLEN_P(tmp) = strlen(ss);
518	                        Z_STRVAL_P(tmp) = estrndup(ss, Z_STRLEN_P(tmp));
519	                        INIT_PZVAL(tmp);
520	                        count++;
521	                        if (zend_hash_next_index_insert(Z_ARRVAL_P(arr), &tmp, sizeof(zval *), NULL) == FAILURE) {
522	                                if (Z_TYPE_P(tmp) == IS_STRING) {
523	                                        efree(Z_STRVAL_P(tmp));
524	                                }
525	                        }
526	                        if (space) {
527	                                *space = '+';
528	                                ss = space + 1;
529	                        } else {
530	                                ss = space;
531	                        }
532	                }
533	        }
534	
535	        /* prepare argc */
536	        ALLOC_INIT_ZVAL(argc);
537	        if (SG(request_info).argc) {
538	                Z_LVAL_P(argc) = SG(request_info).argc;
539	        } else {
540	                Z_LVAL_P(argc) = count;
541	        }
542	        Z_TYPE_P(argc) = IS_LONG;
543	
544	        if (PG(register_globals) || SG(request_info).argc) {
545	                Z_ADDREF_P(arr);
546	                Z_ADDREF_P(argc);
547	                zend_hash_update(&EG(symbol_table), "argv", sizeof("argv"), &arr, sizeof(zval *), NULL);
548	                zend_hash_add(&EG(symbol_table), "argc", sizeof("argc"), &argc, sizeof(zval *), NULL);
549	        } 
550	        if (track_vars_array) {
551	                Z_ADDREF_P(arr);
552	                Z_ADDREF_P(argc);
553	                zend_hash_update(Z_ARRVAL_P(track_vars_array), "argv", sizeof("argv"), &arr, sizeof(zval *), NULL);
554	                zend_hash_update(Z_ARRVAL_P(track_vars_array), "argc", sizeof("argc"), &argc, sizeof(zval *), NULL);
555	        }
556	        zval_ptr_dtor(&arr);
557	        zval_ptr_dtor(&argc);
558	}
559	/* }}} */
560	
561	/* {{{ php_handle_special_queries
562	 */
563	PHPAPI int php_handle_special_queries(TSRMLS_D)
564	{
565	        if (PG(expose_php) && SG(request_info).query_string && SG(request_info).query_string[0] == '=') {
566	                if (php_info_logos(SG(request_info).query_string + 1 TSRMLS_CC)) {
567	                        return 1;
568	                } else if (!strcmp(SG(request_info).query_string + 1, PHP_CREDITS_GUID)) {
569	                        php_print_credits(PHP_CREDITS_ALL TSRMLS_CC);
570	                        return 1;
571	                }
572	        }
573	        return 0;
574	}
575	/* }}} */
576	
577	/* {{{ php_register_server_variables
578	 */
579	static inline void php_register_server_variables(TSRMLS_D)
580	{
581	        zval *array_ptr = NULL;
582	        /* turn off magic_quotes while importing server variables */
583	        int magic_quotes_gpc = PG(magic_quotes_gpc);
584	
585	        ALLOC_ZVAL(array_ptr);
586	        array_init(array_ptr);
587	        INIT_PZVAL(array_ptr);
588	        if (PG(http_globals)[TRACK_VARS_SERVER]) {
589	                zval_ptr_dtor(&PG(http_globals)[TRACK_VARS_SERVER]);
590	        }
591	        PG(http_globals)[TRACK_VARS_SERVER] = array_ptr;
592	        PG(magic_quotes_gpc) = 0;
593	
594	        /* Server variables */
595	        if (sapi_module.register_server_variables) {
596	                sapi_module.register_server_variables(array_ptr TSRMLS_CC);
597	        }
598	
599	        /* PHP Authentication support */
600	        if (SG(request_info).auth_user) {
601	                php_register_variable("PHP_AUTH_USER", SG(request_info).auth_user, array_ptr TSRMLS_CC);
602	        }
603	        if (SG(request_info).auth_password) {
604	                php_register_variable("PHP_AUTH_PW", SG(request_info).auth_password, array_ptr TSRMLS_CC);
605	        }
606	        if (SG(request_info).auth_digest) {
607	                php_register_variable("PHP_AUTH_DIGEST", SG(request_info).auth_digest, array_ptr TSRMLS_CC);
608	        }
609	        /* store request init time */
610	        {
611	                zval new_entry;
612	                Z_TYPE(new_entry) = IS_LONG;
613	                Z_LVAL(new_entry) = sapi_get_request_time(TSRMLS_C);
614	                php_register_variable_ex("REQUEST_TIME", &new_entry, array_ptr TSRMLS_CC);
615	        }
616	
617	        PG(magic_quotes_gpc) = magic_quotes_gpc;
618	}
619	/* }}} */
620	
621	/* {{{ php_autoglobal_merge
622	 */
623	static void php_autoglobal_merge(HashTable *dest, HashTable *src TSRMLS_DC)
624	{
625	        zval **src_entry, **dest_entry;
626	        char *string_key;
627	        uint string_key_len;
628	        ulong num_key;
629	        HashPosition pos;
630	        int key_type;
631	        int globals_check = (PG(register_globals) && (dest == (&EG(symbol_table))));
632	
633	        zend_hash_internal_pointer_reset_ex(src, &pos);
634	        while (zend_hash_get_current_data_ex(src, (void **)&src_entry, &pos) == SUCCESS) {
635	                key_type = zend_hash_get_current_key_ex(src, &string_key, &string_key_len, &num_key, 0, &pos);
636	                if (Z_TYPE_PP(src_entry) != IS_ARRAY
637	                        || (key_type == HASH_KEY_IS_STRING && zend_hash_find(dest, string_key, string_key_len, (void **) &dest_entry) != SUCCESS)
638	                        || (key_type == HASH_KEY_IS_LONG && zend_hash_index_find(dest, num_key, (void **)&dest_entry) != SUCCESS)
639	                        || Z_TYPE_PP(dest_entry) != IS_ARRAY
640	        ) {
641	                        Z_ADDREF_PP(src_entry);
642	                        if (key_type == HASH_KEY_IS_STRING) {
643	                                /* if register_globals is on and working with main symbol table, prevent overwriting of GLOBALS */
644	                                if (!globals_check || string_key_len != sizeof("GLOBALS") || memcmp(string_key, "GLOBALS", sizeof("GLOBALS") - 1)) {
645	                                        zend_hash_update(dest, string_key, string_key_len, src_entry, sizeof(zval *), NULL);
646	                                } else {
647	                                        Z_DELREF_PP(src_entry);
648	                                }
649	                        } else {
650	                                zend_hash_index_update(dest, num_key, src_entry, sizeof(zval *), NULL);
651	                        }
652	                } else {
653	                        SEPARATE_ZVAL(dest_entry);
654	                        php_autoglobal_merge(Z_ARRVAL_PP(dest_entry), Z_ARRVAL_PP(src_entry) TSRMLS_CC);
655	                }
656	                zend_hash_move_forward_ex(src, &pos);
657	        }
658	}
659	/* }}} */
660	
661	static zend_bool php_auto_globals_create_server(char *name, uint name_len TSRMLS_DC);
662	static zend_bool php_auto_globals_create_env(char *name, uint name_len TSRMLS_DC);
663	static zend_bool php_auto_globals_create_request(char *name, uint name_len TSRMLS_DC);
664	
665	/* {{{ php_hash_environment
666	 */
667	int php_hash_environment(TSRMLS_D)
668	{
669	        char *p;
670	        unsigned char _gpc_flags[5] = {0, 0, 0, 0, 0};
671	        zend_bool jit_initialization = (PG(auto_globals_jit) && !PG(register_globals) && !PG(register_long_arrays));
672	        struct auto_global_record {
673	                char *name;
674	                uint name_len;
675	                char *long_name;
676	                uint long_name_len;
677	                zend_bool jit_initialization;
678	        } auto_global_records[] = {
679	                { "_POST", sizeof("_POST"), "HTTP_POST_VARS", sizeof("HTTP_POST_VARS"), 0 },
680	                { "_GET", sizeof("_GET"), "HTTP_GET_VARS", sizeof("HTTP_GET_VARS"), 0 },
681	                { "_COOKIE", sizeof("_COOKIE"), "HTTP_COOKIE_VARS", sizeof("HTTP_COOKIE_VARS"), 0 },
682	                { "_SERVER", sizeof("_SERVER"), "HTTP_SERVER_VARS", sizeof("HTTP_SERVER_VARS"), 1 },
683	                { "_ENV", sizeof("_ENV"), "HTTP_ENV_VARS", sizeof("HTTP_ENV_VARS"), 1 },
684	                { "_FILES", sizeof("_FILES"), "HTTP_POST_FILES", sizeof("HTTP_POST_FILES"), 0 },
685	        };
686	        size_t num_track_vars = sizeof(auto_global_records)/sizeof(struct auto_global_record);
687	        size_t i;
688	
689	        /* jit_initialization = 0; */
690	        for (i=0; i<num_track_vars; i++) {
691	                PG(http_globals)[i] = NULL;
692	        }
693	
694	        for (p=PG(variables_order); p && *p; p++) {
695	                switch(*p) {
696	                        case 'p':
697	                        case 'P':
698	                                if (!_gpc_flags[0] && !SG(headers_sent) && SG(request_info).request_method && !strcasecmp(SG(request_info).request_method, "POST")) {
699	                                        sapi_module.treat_data(PARSE_POST, NULL, NULL TSRMLS_CC);       /* POST Data */
700	                                        _gpc_flags[0] = 1;
701	                                        if (PG(register_globals)) {
702	                                                php_autoglobal_merge(&EG(symbol_table), Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_POST]) TSRMLS_CC);
703	                                        }
704	                                }
705	                                break;
706	                        case 'c':
707	                        case 'C':
708	                                if (!_gpc_flags[1]) {
709	                                        sapi_module.treat_data(PARSE_COOKIE, NULL, NULL TSRMLS_CC);     /* Cookie Data */
710	                                        _gpc_flags[1] = 1;
711	                                        if (PG(register_globals)) {
712	                                                php_autoglobal_merge(&EG(symbol_table), Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_COOKIE]) TSRMLS_CC);
713	                                        }
714	                                }
715	                                break;
716	                        case 'g':
717	                        case 'G':
718	                                if (!_gpc_flags[2]) {
719	                                        sapi_module.treat_data(PARSE_GET, NULL, NULL TSRMLS_CC);        /* GET Data */
720	                                        _gpc_flags[2] = 1;
721	                                        if (PG(register_globals)) {
722	                                                php_autoglobal_merge(&EG(symbol_table), Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_GET]) TSRMLS_CC);
723	                                        }
724	                                }
725	                                break;
726	                        case 'e':
727	                        case 'E':
728	                                if (!jit_initialization && !_gpc_flags[3]) {
729	                                        zend_auto_global_disable_jit("_ENV", sizeof("_ENV")-1 TSRMLS_CC);
730	                                        php_auto_globals_create_env("_ENV", sizeof("_ENV")-1 TSRMLS_CC);
731	                                        _gpc_flags[3] = 1;
732	                                        if (PG(register_globals)) {
733	                                                php_autoglobal_merge(&EG(symbol_table), Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_ENV]) TSRMLS_CC);
734	                                        }
735	                                }
736	                                break;
737	                        case 's':
738	                        case 'S':
739	                                if (!jit_initialization && !_gpc_flags[4]) {
740	                                        zend_auto_global_disable_jit("_SERVER", sizeof("_SERVER")-1 TSRMLS_CC);
741	                                        php_register_server_variables(TSRMLS_C);
742	                                        _gpc_flags[4] = 1;
743	                                        if (PG(register_globals)) {
744	                                                php_autoglobal_merge(&EG(symbol_table), Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_SERVER]) TSRMLS_CC);
745	                                        }
746	                                }
747	                                break;
748	                }
749	        }
750	
751	        /* argv/argc support */
752	        if (PG(register_argc_argv)) {
753	                php_build_argv(SG(request_info).query_string, PG(http_globals)[TRACK_VARS_SERVER] TSRMLS_CC);
754	        }
755	
756	        for (i=0; i<num_track_vars; i++) {
757	                if (jit_initialization && auto_global_records[i].jit_initialization) {
758	                        continue;
759	                }
760	                if (!PG(http_globals)[i]) {
761	                        ALLOC_ZVAL(PG(http_globals)[i]);
762	                        array_init(PG(http_globals)[i]);
763	                        INIT_PZVAL(PG(http_globals)[i]);
764	                }
765	
766	                Z_ADDREF_P(PG(http_globals)[i]);
767	                zend_hash_update(&EG(symbol_table), auto_global_records[i].name, auto_global_records[i].name_len, &PG(http_globals)[i], sizeof(zval *), NULL);
768	                if (PG(register_long_arrays)) {
769	                        zend_hash_update(&EG(symbol_table), auto_global_records[i].long_name, auto_global_records[i].long_name_len, &PG(http_globals)[i], sizeof(zval *), NULL);
770	                        Z_ADDREF_P(PG(http_globals)[i]);
771	                }
772	        }
773	
774	        /* Create _REQUEST */
775	        if (!jit_initialization) {
776	                zend_auto_global_disable_jit("_REQUEST", sizeof("_REQUEST")-1 TSRMLS_CC);
777	                php_auto_globals_create_request("_REQUEST", sizeof("_REQUEST")-1 TSRMLS_CC);
778	        }
779	
780	        return SUCCESS;
781	}
782	/* }}} */
783	
784	static zend_bool php_auto_globals_create_server(char *name, uint name_len TSRMLS_DC)
785	{
786	        if (PG(variables_order) && (strchr(PG(variables_order),'S') || strchr(PG(variables_order),'s'))) {
787	                php_register_server_variables(TSRMLS_C);
788	
789	                if (PG(register_argc_argv)) {
790	                        if (SG(request_info).argc) {
791	                                zval **argc, **argv;
792	        
793	                                if (zend_hash_find(&EG(symbol_table), "argc", sizeof("argc"), (void**)&argc) == SUCCESS &&
794	                                    zend_hash_find(&EG(symbol_table), "argv", sizeof("argv"), (void**)&argv) == SUCCESS) {
795	                                        Z_ADDREF_PP(argc);
796	                                        Z_ADDREF_PP(argv);
797	                                        zend_hash_update(Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_SERVER]), "argv", sizeof("argv"), argv, sizeof(zval *), NULL);
798	                                        zend_hash_update(Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_SERVER]), "argc", sizeof("argc"), argc, sizeof(zval *), NULL);
799	                                }
800	                        } else {
801	                                php_build_argv(SG(request_info).query_string, PG(http_globals)[TRACK_VARS_SERVER] TSRMLS_CC);
802	                        }
803	                }
804	        
805	        } else {
806	                zval *server_vars=NULL;
807	                ALLOC_ZVAL(server_vars);
808	                array_init(server_vars);
809	                INIT_PZVAL(server_vars);
810	                if (PG(http_globals)[TRACK_VARS_SERVER]) {
811	                        zval_ptr_dtor(&PG(http_globals)[TRACK_VARS_SERVER]);
812	                }
813	                PG(http_globals)[TRACK_VARS_SERVER] = server_vars;
814	        }
815	
816	        zend_hash_update(&EG(symbol_table), name, name_len + 1, &PG(http_globals)[TRACK_VARS_SERVER], sizeof(zval *), NULL);
817	        Z_ADDREF_P(PG(http_globals)[TRACK_VARS_SERVER]);
818	
819	        if (PG(register_long_arrays)) {
820	                zend_hash_update(&EG(symbol_table), "HTTP_SERVER_VARS", sizeof("HTTP_SERVER_VARS"), &PG(http_globals)[TRACK_VARS_SERVER], sizeof(zval *), NULL);
821	                Z_ADDREF_P(PG(http_globals)[TRACK_VARS_SERVER]);
822	        }
823	        
824	        return 0; /* don't rearm */
825	}
826	
827	static zend_bool php_auto_globals_create_env(char *name, uint name_len TSRMLS_DC)
828	{
829	        zval *env_vars = NULL;
830	        ALLOC_ZVAL(env_vars);
831	        array_init(env_vars);
832	        INIT_PZVAL(env_vars);
833	        if (PG(http_globals)[TRACK_VARS_ENV]) {
834	                zval_ptr_dtor(&PG(http_globals)[TRACK_VARS_ENV]);
835	        }
836	        PG(http_globals)[TRACK_VARS_ENV] = env_vars;
837	        
838	        if (PG(variables_order) && (strchr(PG(variables_order),'E') || strchr(PG(variables_order),'e'))) {
839	                php_import_environment_variables(PG(http_globals)[TRACK_VARS_ENV] TSRMLS_CC);
840	        }
841	
842	        zend_hash_update(&EG(symbol_table), name, name_len + 1, &PG(http_globals)[TRACK_VARS_ENV], sizeof(zval *), NULL);
843	        Z_ADDREF_P(PG(http_globals)[TRACK_VARS_ENV]);
844	
845	        if (PG(register_long_arrays)) {
846	                zend_hash_update(&EG(symbol_table), "HTTP_ENV_VARS", sizeof("HTTP_ENV_VARS"), &PG(http_globals)[TRACK_VARS_ENV], sizeof(zval *), NULL);
847	                Z_ADDREF_P(PG(http_globals)[TRACK_VARS_ENV]);
848	        }
849	
850	        return 0; /* don't rearm */
851	}
852	
853	static zend_bool php_auto_globals_create_request(char *name, uint name_len TSRMLS_DC)
854	{
855	        zval *form_variables;
856	        unsigned char _gpc_flags[3] = {0, 0, 0};
857	        char *p;
858	
859	        ALLOC_ZVAL(form_variables);
860	        array_init(form_variables);
861	        INIT_PZVAL(form_variables);
862	
863	        if(PG(request_order) != NULL) {
864	                p = PG(request_order);
865	        } else {
866	                p = PG(variables_order);
867	        }
868	
869	        for (; p && *p; p++) {
870	                switch (*p) {
871	                        case 'g':
872	                        case 'G':
873	                                if (!_gpc_flags[0]) {
874	                                        php_autoglobal_merge(Z_ARRVAL_P(form_variables), Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_GET]) TSRMLS_CC);
875	                                        _gpc_flags[0] = 1;
876	                                }
877	                                break;
878	                        case 'p':
879	                        case 'P':
880	                                if (!_gpc_flags[1]) {
881	                                        php_autoglobal_merge(Z_ARRVAL_P(form_variables), Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_POST]) TSRMLS_CC);
882	                                        _gpc_flags[1] = 1;
883	                                }
884	                                break;
885	                        case 'c':
886	                        case 'C':
887	                                if (!_gpc_flags[2]) {
888	                                        php_autoglobal_merge(Z_ARRVAL_P(form_variables), Z_ARRVAL_P(PG(http_globals)[TRACK_VARS_COOKIE]) TSRMLS_CC);
889	                                        _gpc_flags[2] = 1;
890	                                }
891	                                break;
892	                }
893	        }
894	
895	        zend_hash_update(&EG(symbol_table), "_REQUEST", sizeof("_REQUEST"), &form_variables, sizeof(zval *), NULL);
896	        return 0;
897	}
898	
899	void php_startup_auto_globals(TSRMLS_D)
900	{
901	        zend_register_auto_global("_GET", sizeof("_GET")-1, NULL TSRMLS_CC);
902	        zend_register_auto_global("_POST", sizeof("_POST")-1, NULL TSRMLS_CC);
903	        zend_register_auto_global("_COOKIE", sizeof("_COOKIE")-1, NULL TSRMLS_CC);
904	        zend_register_auto_global("_SERVER", sizeof("_SERVER")-1, php_auto_globals_create_server TSRMLS_CC);
905	        zend_register_auto_global("_ENV", sizeof("_ENV")-1, php_auto_globals_create_env TSRMLS_CC);
906	        zend_register_auto_global("_REQUEST", sizeof("_REQUEST")-1, php_auto_globals_create_request TSRMLS_CC);
907	        zend_register_auto_global("_FILES", sizeof("_FILES")-1, NULL TSRMLS_CC);
908	}
909	
910	/*
911	 * Local variables:
912	 * tab-width: 4
913	 * c-basic-offset: 4
914	 * End:
915	 * vim600: sw=4 ts=4 fdm=marker
916	 * vim<600: sw=4 ts=4
917	 */
