/**
 * Full netsec schema fixture (anonymized from the netsec app db schema).
 *
 * Auto-generated from the netsec database `schema.sql` (pg_dump) by a
 * deterministic DDL->TS converter, then committed. Covers ALL tables so the
 * integration corpus exercises realistic type-level memory pressure.
 *
 * Type mapping: text/varchar/uuid -> string; int/bigint/numeric/double -> number;
 * boolean -> boolean; timestamp/date/time -> string; jsonb/json -> Json;
 * inet/cidr/bytea -> unknown; enums -> string-literal union; T[] -> arrays;
 * absent NOT NULL -> `| null`.
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export type NetsecSchema = {
    defaultSchema: "public";
    schemas: {
        payload_storage: {
            tarpit_header: {
                content: string;
                created_at: string;
                id: string;
                indexed: boolean;
            };
            tarpit_iptrap_ingestion: {
                data: Json;
                tag: string;
                timestamp: string;
            };
            tarpit_payload: {
                content: string;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                indexed: boolean;
                type: string | null;
            };
            tarpit_server_ingestion: {
                data: Json;
                tag: string;
                timestamp: string;
            };
        };
        public: {
            agent_ip: {
                agent_key_id: string;
                created_at: string;
                info: string | null;
                ip: unknown;
                last_ping_at: string;
            };
            agent_key: {
                company_id: string | null;
                created_at: string;
                id: string;
                key: string;
                name: string | null;
                user_id: string | null;
            };
            api_key: {
                aws_api_key_id: string | null;
                company_id: string | null;
                created_at: string;
                description: string | null;
                enabled: boolean;
                id: string;
                key: string | null;
                usage_plan_id: string | null;
                user_id: string | null;
            };
            api_key_date: {
                date: string;
                key: string;
                requests: number;
            };
            api_key_settings: {
                api_key_id: string;
                settings: Json | null;
            };
            api_key_usage_plan: {
                aws_usage_plan_id: string | null;
                company_id: string | null;
                created_at: string;
                id: string;
                per_month: number;
                per_second: number;
                per_second_burst: number;
                user_id: string | null;
            };
            blacklight_profile: {
                added_at: string;
                alias: string | null;
                created_at: string | null;
                data: Json;
                email: string | null;
                id: string;
                indexed: boolean;
                modified_at: string | null;
                name: string | null;
                original_id: string | null;
                photo_url: string | null;
                search: string;
            };
            blacklight_ransomware_attack: {
                added: string | null;
                additional_info: Json | null;
                country: string | null;
                date: string;
                domain: string | null;
                entity_name: string;
                hash_id: string;
                id: string;
                indexed: boolean;
                summary: string | null;
                title: string | null;
                url: string | null;
            };
            blacklight_ransomware_group: {
                description: string | null;
                details: Json;
                id: string;
                indexed: boolean;
                name_id: string;
                tools: string[] | null;
            };
            blacklight_ransomware_victim: {
                activity: string | null;
                country: string | null;
                description: string | null;
                discovered: string | null;
                entity_id: string | null;
                entity_last_checked_at: string | null;
                entity_name: string;
                group: string | null;
                hash_id: string;
                id: string;
                indexed: boolean;
                infostealer: Json | null;
                modifications: Json | null;
                post_url: string | null;
                published: string | null;
                screenshot: string | null;
                website: string | null;
            };
            blacklist_cidr: {
                added_at: string;
                cidr: unknown;
                confidence: number | null;
                source: string;
            };
            blacklist_ip: {
                added_at: string;
                confidence: number | null;
                ip: unknown;
                source: string;
            };
            blacklist_source: {
                description: string;
                id: string;
            };
            company: {
                created_at: string;
                id: string;
                logo: Json | null;
                name: string;
                settings: Json;
            };
            company_addr: {
                addr: unknown;
                company_id: string;
                created_at: string;
                deleted: boolean;
                processed: boolean;
            };
            company_country: {
                company_id: string;
                country: string;
                dns_log_count: number;
                ip_count: number;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_count: number;
                total_request_count: number | null;
            };
            company_country_date: {
                company_id: string;
                country: string;
                date: string;
                dns_log_count: number;
                ip_count: number;
                tarpit_log_count: number;
                total_request_count: number | null;
            };
            company_domain: {
                added_to_passive_dns_watchlist: boolean;
                company_id: string;
                domain: string;
                failed_passive_dns: boolean | null;
                similar_last_checked_at: string | null;
            };
            company_domain_similar: {
                company_id: string;
                domain: string;
                request_status: string | null;
                similar_domain: string;
                status_changed_at: string | null;
                takedown_requested: boolean;
            };
            company_offload: {
                company_id: string;
                created_at: string;
                credentials_id: string;
                id: string;
                type: string;
            };
            company_report_date: {
                company_id: string;
                date: string;
                dns_log_counter: number;
                ip_count: number;
                tarpit_log_counter: number;
            };
            company_report_threat: {
                company_id: string;
                dns_log_count: number;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                spread: number;
                tarpit_log_count: number;
                threat_id: string;
                total_request_count: number;
            };
            company_report_threat_domain: {
                company_id: string;
                dns_log_counter: number;
                domain: string;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                spread: number;
                tarpit_log_counter: number;
            };
            company_report_threat_domain_date: {
                company_id: string;
                date: string;
                dns_log_counter: number;
                domain: string;
                tarpit_log_counter: number;
            };
            company_stats: {
                company_id: string;
                dns_log_count: number;
                ip_count: number;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_count: number;
                threat_domain_count: number;
                total_request_count: number | null;
                victim_ip_count: number;
            };
            company_user: {
                company_id: string;
                user_id: string;
            };
            country: {
                country: string;
                dns_log_count: number;
                ip_count: number;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_count: number;
                total_request_count: number | null;
            };
            country_date: {
                country: string;
                date: string;
                dns_log_count: number;
                ip_count: number;
                tarpit_log_count: number;
                total_request_count: number | null;
            };
            date_counter: {
                date: string;
                dns_log_counter: number;
                domain_registration_counter: number;
                new_ip_counter: number;
                new_threat_domain_counter: number;
                tarpit_log_counter: number;
            };
            dns_log_edge: {
                answer: string;
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                edns: boolean;
                entity_id: string | null;
                forwarded_company_id: string | null;
                id: string;
                ip: unknown;
                proxy: unknown;
                question_class: string;
                question_domain: string;
                question_type: string;
                raw: string;
                time: string;
            };
            dns_log_edge_20260503: {
                answer: string;
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                edns: boolean;
                entity_id: string | null;
                forwarded_company_id: string | null;
                id: string;
                ip: unknown;
                proxy: unknown;
                question_class: string;
                question_domain: string;
                question_type: string;
                raw: string;
                time: string;
            };
            dns_log_edge_20260504: {
                answer: string;
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                edns: boolean;
                entity_id: string | null;
                forwarded_company_id: string | null;
                id: string;
                ip: unknown;
                proxy: unknown;
                question_class: string;
                question_domain: string;
                question_type: string;
                raw: string;
                time: string;
            };
            dns_log_edge_20260505: {
                answer: string;
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                edns: boolean;
                entity_id: string | null;
                forwarded_company_id: string | null;
                id: string;
                ip: unknown;
                proxy: unknown;
                question_class: string;
                question_domain: string;
                question_type: string;
                raw: string;
                time: string;
            };
            dns_log_edge_20260506: {
                answer: string;
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                edns: boolean;
                entity_id: string | null;
                forwarded_company_id: string | null;
                id: string;
                ip: unknown;
                proxy: unknown;
                question_class: string;
                question_domain: string;
                question_type: string;
                raw: string;
                time: string;
            };
            dns_log_edge_20260507: {
                answer: string;
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                edns: boolean;
                entity_id: string | null;
                forwarded_company_id: string | null;
                id: string;
                ip: unknown;
                proxy: unknown;
                question_class: string;
                question_domain: string;
                question_type: string;
                raw: string;
                time: string;
            };
            dns_log_edge_20260508: {
                answer: string;
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                edns: boolean;
                entity_id: string | null;
                forwarded_company_id: string | null;
                id: string;
                ip: unknown;
                proxy: unknown;
                question_class: string;
                question_domain: string;
                question_type: string;
                raw: string;
                time: string;
            };
            dns_log_edge_20260509: {
                answer: string;
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                edns: boolean;
                entity_id: string | null;
                forwarded_company_id: string | null;
                id: string;
                ip: unknown;
                proxy: unknown;
                question_class: string;
                question_domain: string;
                question_type: string;
                raw: string;
                time: string;
            };
            dns_log_ingestion: {
                data: Json | null;
                tag: string | null;
                time: string | null;
            };
            dns_log_queue: {
                country: string | null;
                customer_company_id: string | null;
                domain: string;
                entity_id: string | null;
                id: string;
                ip: unknown;
                question_domain: string | null;
                threat_id: string | null;
                threat_name: string | null;
                time: string;
            };
            dnsintel_hunt: {
                added_at: string;
                domain: string;
                source_id: string;
            };
            dnsintel_log: {
                answer: string;
                asn: string | null;
                asn_organization: string | null;
                domain: string;
                first_seen: string | null;
                geolocation_city: string | null;
                geolocation_country: string | null;
                geolocation_latitude: number | null;
                geolocation_longitude: number | null;
                id: string;
                last_seen: string | null;
                original_answer: string | null;
                original_record_type: string | null;
                record_type: string;
            };
            domain: {
                country: string | null;
                creation_date: string | null;
                domain: string;
                expiration_date: string | null;
                manually_created: boolean;
                registrant_email: string | null;
                registrar: string | null;
                registrar_id: number | null;
                registration_ip: unknown | null;
                source: string;
                status: string | null;
            };
            domain_archive: {
                country: string | null;
                creation_date: string;
                customer: Json | null;
                domain: string;
                expiration_date: string | null;
                indexed: boolean | null;
                misc: Json | null;
                registrant: Json | null;
                registrant_email: string | null;
                registrar: string | null;
                registrar_id: number | null;
                registration_ip: unknown | null;
                reseller: Json | null;
                source: string;
                status: string | null;
            };
            domain_customer: {
                customer: Json | null;
                domain: string;
            };
            domain_dns_status: {
                addrs: string[] | null;
                domain: string;
                error: string | null;
                is_active: boolean;
                last_checked_at: string | null;
            };
            domain_index_queue: {
                attempts: number;
                domain: string;
                last_error: string | null;
                locked_at: string | null;
                queued_at: string;
            };
            domain_misc: {
                domain: string;
                misc: Json | null;
            };
            domain_registrant: {
                domain: string;
                registrant: Json | null;
            };
            domain_registrant_email: {
                email: string;
            };
            domain_reseller: {
                domain: string;
                reseller: Json | null;
            };
            domain_settings: {
                acme_challenge: string[] | null;
                cert: string | null;
                cert_chain: string | null;
                cert_expires_at: string | null;
                cert_fullchain: string | null;
                cert_generated_at: string | null;
                cert_generation_started_at: string | null;
                cert_private_key: string | null;
                collect_gzipped_payloads: boolean;
                collect_headers: boolean;
                collect_https_payloads: boolean;
                collect_only_accepted: boolean;
                collect_payloads: boolean;
                domain: string;
                enabled: boolean;
                force_refresh: boolean;
                target: string | null;
            };
            entity: {
                domain: string | null;
                id: string;
                name: string;
                old_id: string;
                type: string | null;
            };
            entity_cidr: {
                asn: string | null;
                cidr: unknown;
                entity_id: string;
            };
            entity_counter: {
                counter: number | null;
                dns_log_counter: number | null;
                dns_log_last_match: string | null;
                entity_id: string;
                last_match: string | null;
                tarpit_log_counter: number | null;
                tarpit_log_last_match: string | null;
            };
            entity_date: {
                counter: number | null;
                date: string;
                dns_log_counter: number;
                entity_id: string;
                tarpit_log_counter: number;
            };
            entity_threat_domain: {
                dns_log_counter: number | null;
                domain: string;
                entity_id: string;
                first_dns_log_match: string | null;
                first_tarpit_log_match: string | null;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_counter: number | null;
            };
            general_stats: {
                active_registered_domain_count: number;
                dns_log_count: number;
                id: number;
                ip_count: number;
                new_ip_count: number;
                registered_domain_count: number;
                registrant_email_count: number;
                tarpit_log_count: number;
                threat_count: number;
                threat_domain_count: number;
            };
            geo_import_jobs: {
                chunk_keys: Json[] | null;
                completed_at: string | null;
                error: string | null;
                file_key: string;
                id: number;
                reviewed: boolean;
                started_at: string | null;
                status: string;
                task_arns: Json | null;
                updated_at: string | null;
                workers_completed: number | null;
                workers_total: number | null;
            };
            hunt_expiring_queue: {
                domain: string;
                expiration_date: string;
                expired: boolean;
                source: string;
                status: string | null;
                status_changed_at: string | null;
            };
            hunt_report_log: {
                creation_date: string | null;
                domain: string;
                domain_type: string | null;
                evidence: string[];
                expiration_date: string | null;
                original_name_servers: string[] | null;
                registrant_email: string | null;
                registrant_name: string | null;
                registrar: string | null;
                registrar_id: number | null;
                status: string | null;
                threat: string | null;
                threat_actor: string | null;
                threat_description: string | null;
                threat_id: string | null;
                threat_type: string | null;
            };
            hunt_report_queue: {
                created_at: string;
                domain: string;
                domain_info: Json | null;
                registrant_info: Json | null;
                registrar_id: number | null;
                registrar_info: Json | null;
                reject_reason: string | null;
                rejected: boolean;
                source_id: string;
                status: string | null;
                submitted_to_registrar: boolean;
                threat_id: string | null;
                threat_info: Json | null;
            };
            ip: {
                company_last_updated_at: string | null;
                counter: number | null;
                country: string | null;
                country_last_updated_at: string | null;
                created_at: string | null;
                customer_company_id: string | null;
                customer_company_last_updated_at: string | null;
                dns_and_tarpit: boolean;
                dns_log_counter: number;
                entity_id: string | null;
                entity_last_updated_at: string | null;
                ip: unknown;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_counter: number;
            };
            ip_checker_log: {
                client_ip: unknown;
                found: boolean;
                id: string;
                requested_ip: unknown;
                time: string;
            };
            ip_company_date: {
                company_id: string;
                counter: number | null;
                date: string;
                dns_log_counter: number;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date: {
                counter: number | null;
                date: string;
                dns_log_counter: number;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202505: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202506: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202507: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202508: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202509: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202510: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202511: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202512: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202601: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202602: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202603: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202604: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202605: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_date_threat_domain_202606: {
                date: string;
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                tarpit_log_counter: number;
            };
            ip_geo: {
                as_number: number | null;
                cidr: unknown;
                city: string | null;
                connection_type: "dialup" | "isdn" | "cable" | "dsl" | "fttx" | "wireless" | null;
                continent: string | null;
                country: string | null;
                district: string | null;
                geoname_id: number | null;
                isp_name: string | null;
                location: unknown | null;
                organization_name: string | null;
                stateprov: string | null;
                stateprov_code: string | null;
                timezone_name: string | null;
                timezone_offset: number | null;
                usage_type: "corporate" | "consumer" | "hosting" | null;
                weather_code: string | null;
                zipcode: string | null;
            };
            ip_geo_cache: {
                as_number: number | null;
                cached_at: string;
                city: string | null;
                connection_type: "dialup" | "isdn" | "cable" | "dsl" | "fttx" | "wireless" | null;
                continent: string | null;
                country: string | null;
                district: string | null;
                geoname_id: number | null;
                ip: unknown;
                isp_name: string | null;
                location: unknown | null;
                organization_name: string | null;
                stateprov: string | null;
                stateprov_code: string | null;
                timezone_name: string | null;
                timezone_offset: number | null;
                usage_type: "corporate" | "consumer" | "hosting" | null;
                weather_code: string | null;
                zipcode: string | null;
            };
            ip_geo_new: {
                as_number: number | null;
                cidr: unknown;
                city: string | null;
                connection_type: "dialup" | "isdn" | "cable" | "dsl" | "fttx" | "wireless" | null;
                continent: string | null;
                country: string | null;
                district: string | null;
                geoname_id: number | null;
                isp_name: string | null;
                location: unknown | null;
                organization_name: string | null;
                stateprov: string | null;
                stateprov_code: string | null;
                timezone_name: string | null;
                timezone_offset: number | null;
                usage_type: "corporate" | "consumer" | "hosting" | null;
                weather_code: string | null;
                zipcode: string | null;
            };
            ip_last_hour: {
                counter: number | null;
                dns_log_counter: number;
                ip: unknown;
                tarpit_log_counter: number;
                time: string;
            };
            ip_tarpit_port: {
                first_occurence: string;
                ip: unknown;
                last_occurence: string;
                occurences: number;
                port: number;
            };
            ip_threat_domain: {
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                last_dns_log_match: string | null;
                last_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_counter: number;
            };
            offload_credentials: {
                company_id: string | null;
                created_at: string;
                credentials: Json;
                id: string;
                type: string;
                updated_at: string;
                user_id: string | null;
            };
            registrar: {
                email: string | null;
                id: number;
                name: string;
                rdap_url: string | null;
                status: string | null;
            };
            registrar_hunt: {
                created_at: string;
                domain: string;
            };
            registrar_related_hunt: {
                added_at: string;
                domain: string;
                has_traffic: boolean;
                hunted_domain: string;
                ioc_found: boolean;
                registrant_email: string | null;
                threat: string | null;
                threat_id: string | null;
            };
            settings: {
                current_tc_version: number;
                id: number;
            };
            suspended_domain: {
                created_at: string | null;
                creation_date: string | null;
                current_status: string | null;
                customer: Json | null;
                domain: string;
                expiry_date: string | null;
                indexed: boolean;
                metadata: Json | null;
                reason: string | null;
                registrant: Json | null;
                registrar: string | null;
                reseller: Json | null;
                suspension_date: string | null;
                updated_at: string | null;
            };
            suspended_domain_history: {
                created_at: string | null;
                creation_date: string | null;
                current_status: string | null;
                customer: Json | null;
                domain: string;
                eaq_id: number;
                expiry_date: string | null;
                metadata: Json | null;
                reason: string | null;
                registrant: Json | null;
                registrar: string | null;
                reseller: Json | null;
                suspension_date: string | null;
            };
            system_health: {
                created_at: string;
                data: Json | null;
                group_name: string;
                id: string;
                ip: string | null;
                metric_name: string;
                status: string;
            };
            system_health_history: {
                created_at: string;
                data: Json | null;
                group_name: string;
                id: string;
                ip: string | null;
                metric_name: string;
                status: string;
            };
            tarpit_header: {
                content: string;
                created_at: string;
                id: string;
            };
            tarpit_header_2026_05_03: {
                content: string;
                created_at: string;
                id: string;
            };
            tarpit_header_2026_05_04: {
                content: string;
                created_at: string;
                id: string;
            };
            tarpit_header_2026_05_05: {
                content: string;
                created_at: string;
                id: string;
            };
            tarpit_header_2026_05_06: {
                content: string;
                created_at: string;
                id: string;
            };
            tarpit_header_2026_05_07: {
                content: string;
                created_at: string;
                id: string;
            };
            tarpit_header_2026_05_08: {
                content: string;
                created_at: string;
                id: string;
            };
            tarpit_header_2026_05_09: {
                content: string;
                created_at: string;
                id: string;
            };
            tarpit_iptrap_queue: {
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                ip: unknown;
                method: string | null;
                payload_id: string | null;
                port: number | null;
                scheme: string | null;
                target_domain: string | null;
                target_ip: string | null;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_edge: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                method: string | null;
                payload_id: string | null;
                port: number;
                protocol: string | null;
                requested_by_ip: boolean | null;
                source_ip: unknown;
                target_domain: string | null;
                target_ip: unknown;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_edge_20260503: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                method: string | null;
                payload_id: string | null;
                port: number;
                protocol: string | null;
                requested_by_ip: boolean | null;
                source_ip: unknown;
                target_domain: string | null;
                target_ip: unknown;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_edge_20260504: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                method: string | null;
                payload_id: string | null;
                port: number;
                protocol: string | null;
                requested_by_ip: boolean | null;
                source_ip: unknown;
                target_domain: string | null;
                target_ip: unknown;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_edge_20260505: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                method: string | null;
                payload_id: string | null;
                port: number;
                protocol: string | null;
                requested_by_ip: boolean | null;
                source_ip: unknown;
                target_domain: string | null;
                target_ip: unknown;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_edge_20260506: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                method: string | null;
                payload_id: string | null;
                port: number;
                protocol: string | null;
                requested_by_ip: boolean | null;
                source_ip: unknown;
                target_domain: string | null;
                target_ip: unknown;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_edge_20260507: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                method: string | null;
                payload_id: string | null;
                port: number;
                protocol: string | null;
                requested_by_ip: boolean | null;
                source_ip: unknown;
                target_domain: string | null;
                target_ip: unknown;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_edge_20260508: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                method: string | null;
                payload_id: string | null;
                port: number;
                protocol: string | null;
                requested_by_ip: boolean | null;
                source_ip: unknown;
                target_domain: string | null;
                target_ip: unknown;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_edge_20260509: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers_id: string | null;
                id: string;
                method: string | null;
                payload_id: string | null;
                port: number;
                protocol: string | null;
                requested_by_ip: boolean | null;
                source_ip: unknown;
                target_domain: string | null;
                target_ip: unknown;
                time: string;
                tls_metadata: Json | null;
            };
            tarpit_log_queue: {
                country: string | null;
                customer_company_id: string | null;
                domain: string | null;
                entity_id: string | null;
                forwarded_company_id: string | null;
                forwarded_for: unknown | null;
                headers: string | null;
                headers_id: string | null;
                id: string;
                ip: unknown;
                payload: string | null;
                payload_id: string | null;
                port: number | null;
                protocol: string | null;
                target_domain: string | null;
                threat_id: string | null;
                threat_name: string | null;
                time: string;
            };
            tarpit_payload: {
                content: string | null;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                type: string | null;
            };
            tarpit_payload_2026_05_03: {
                content: string | null;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                type: string | null;
            };
            tarpit_payload_2026_05_04: {
                content: string | null;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                type: string | null;
            };
            tarpit_payload_2026_05_05: {
                content: string | null;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                type: string | null;
            };
            tarpit_payload_2026_05_06: {
                content: string | null;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                type: string | null;
            };
            tarpit_payload_2026_05_07: {
                content: string | null;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                type: string | null;
            };
            tarpit_payload_2026_05_08: {
                content: string | null;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                type: string | null;
            };
            tarpit_payload_2026_05_09: {
                content: string | null;
                created_at: string;
                extracted_data: Json | null;
                failed_decoding: boolean;
                gzipped: boolean;
                has_analyzer: boolean | null;
                id: string;
                type: string | null;
            };
            tarpit_server: {
                description: string | null;
                id: string;
                mac_address: string | null;
                type: string | null;
            };
            tarpit_server_ip: {
                ip: string;
                tarpit_server_id: string | null;
            };
            threat: {
                actor: string | null;
                alias: string | null;
                description: string | null;
                id: string;
                malpedia_data: Json | null;
                name: string;
                notes: string | null;
                type: string | null;
                unmapped: boolean;
                yara_available: boolean;
            };
            threat_date: {
                date: string;
                dns_log_counter: number;
                tarpit_log_counter: number;
                threat_id: string;
            };
            threat_domain: {
                counter: number | null;
                created_at: string;
                dns_log_counter: number;
                domain: string;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_counter: number;
            };
            threat_domain_country_date: {
                country: string;
                date: string;
                dns_log_counter: number | null;
                domain: string;
                tarpit_log_counter: number | null;
            };
            threat_domain_date: {
                date: string;
                dns_log_counter: number;
                domain: string;
                tarpit_log_counter: number;
            };
            threat_domain_variant: {
                domain: string;
                variant: string;
            };
            threat_stats: {
                dns_log_counter: number;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_counter: number;
                threat_id: string;
                total_count: number | null;
            };
            threatfox_ioc: {
                confidence_level: number | null;
                domain: string | null;
                first_seen_at: string | null;
                id: number;
                ioc: string | null;
                ioc_type: string | null;
                ip: unknown | null;
                last_seen_at: string | null;
                malware: string | null;
                malware_alias: string | null;
                malware_printable: string | null;
                reference: string | null;
                reporter: string | null;
                tags: string | null;
                threat_type: string | null;
            };
            user_access: {
                blacklight: Json | null;
                hunt: Json | null;
                id: string;
                logs: Json | null;
                mythic: Json | null;
                registrar: Json | null;
                registry: Json | null;
                report: Json | null;
                silentium: Json | null;
            };
            user_notification: {
                active: boolean;
                created_at: string;
                id: string;
                message: Json;
                type: string;
                user_id: string;
            };
            user_profile: {
                first_name: string | null;
                id: string;
                last_name: string | null;
                tc_version: number;
            };
            user_settings: {
                id: string;
                inactive_session_timeout: number | null;
                registrar_hunt_counter: number;
                registrar_hunt_since_gmt: string | null;
            };
            watchlist: {
                company_id: string | null;
                created_at: string;
                id: string;
                ip_count: number;
                is_company_default: boolean;
                matched_ip_count: number;
                name: string;
                referenced_ip_count: number;
                type: string | null;
                user_id: string | null;
            };
            watchlist_cidr: {
                cidr: unknown;
                created_at: string;
                description: string | null;
                id: string;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                tags: string[] | null;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_company: {
                created_at: string;
                description: string | null;
                entity_id: string | null;
                id: string;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_credentials_domain: {
                created_at: string;
                description: string | null;
                domain: string;
                hosts_count: number;
                id: string;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                matches_count: number;
                tags: string[] | null;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_domain: {
                created_at: string;
                description: string | null;
                domain: string;
                id: string;
                ip: unknown | null;
                ip_reference: unknown | null;
                last_checked_at: string | null;
                last_lookup_at: string | null;
                last_match_at: string | null;
                lookup_disabled: boolean;
                lookup_failed: boolean;
                matched: boolean;
                metadata: Json | null;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_ip: {
                created_at: string;
                description: string | null;
                id: string;
                ip: unknown;
                ip_reference: unknown | null;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                tags: string[] | null;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_ip_match: {
                cidr: unknown | null;
                entity_id: string | null;
                ip: unknown;
                last_dns_log_match: string | null;
                last_match: string | null;
                last_tarpit_log_match: string | null;
                watchlist_id: string;
            };
            watchlist_notification: {
                active: boolean;
                company_id: string | null;
                counter: number | null;
                created_at: string;
                disabled: boolean;
                id: string;
                user_id: string;
                watchlist_cidr: string | null;
                watchlist_company: string | null;
                watchlist_credentials_domain: string | null;
                watchlist_domain: string | null;
                watchlist_id: string;
                watchlist_ip: string | null;
                watchlist_tarpit_query: string | null;
                watchlist_username: string | null;
            };
            watchlist_tarpit_query: {
                content: string | null;
                created_at: string;
                description: string | null;
                header_id: string | null;
                id: string;
                ip_reference: unknown | null;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                payload_id: string | null;
                query: string;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_username: {
                created_at: string;
                description: string | null;
                id: string;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                tags: string[] | null;
                user_id: string | null;
                username: string;
                watchlist_id: string;
            };
        };
    };
};
